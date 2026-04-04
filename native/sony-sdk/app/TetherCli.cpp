// TetherCli.cpp - Minimal Sony Camera Remote SDK tether helper
// Auto-connects to the first USB camera found, sets save-to-PC,
// and prints "CAPTURED:<filepath>" for each downloaded photo.
// Designed to be driven by a Node.js parent process.
//
// Usage: TetherCli <output_directory>

#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <string>
#include <atomic>
#include <chrono>
#include <thread>
#include <iostream>
#include <filesystem>
#include <csignal>

#if defined(__APPLE__)
#include <unistd.h>
#endif

#include "CRSDK/CameraRemote_SDK.h"
#include "CRSDK/IDeviceCallback.h"

namespace SDK = SCRSDK;

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
static std::atomic<bool> g_running{true};
static std::atomic<bool> g_connected{false};
static std::string g_outputDir;

// Flush-safe line printer to stdout (Node.js reads these lines)
static void emit(const char* line)
{
    std::fputs(line, stdout);
    std::fputc('\n', stdout);
    std::fflush(stdout);
}

static void emit(const std::string& line)
{
    emit(line.c_str());
}

// ---------------------------------------------------------------------------
// Signal handler for graceful exit
// ---------------------------------------------------------------------------
static void sighandler(int)
{
    g_running.store(false);
}

// ---------------------------------------------------------------------------
// TetherCallback - minimal IDeviceCallback implementation
// ---------------------------------------------------------------------------
class TetherCallback : public SDK::IDeviceCallback
{
public:
    TetherCallback() = default;

    void OnConnected(SDK::DeviceConnectionVersioin /*version*/) override
    {
        g_connected.store(true);
    }

    void OnDisconnected(CrInt32u /*error*/) override
    {
        g_connected.store(false);
        emit("STATUS:DISCONNECTED");
    }

    void OnPropertyChanged() override {}
    void OnPropertyChangedCodes(CrInt32u /*num*/, CrInt32u* /*codes*/) override {}
    void OnLvPropertyChanged() override {}
    void OnLvPropertyChangedCodes(CrInt32u /*num*/, CrInt32u* /*codes*/) override {}

    // Called when a file finishes downloading to the PC
    void OnCompleteDownload(CrChar* filename, CrInt32u /*type*/) override
    {
        if (filename) {
            std::string msg = "CAPTURED:";
            msg += filename;
            emit(msg);
        }
    }

    // Called when contents transfer progresses / completes
    void OnNotifyContentsTransfer(CrInt32u notify,
                                  SDK::CrContentHandle /*contentHandle*/,
                                  CrChar* filename) override
    {
        if (notify == SDK::CrNotify_ContentsTransfer_Complete && filename) {
            std::string msg = "CAPTURED:";
            msg += filename;
            emit(msg);
        }
    }

    void OnWarning(CrInt32u warning) override
    {
        if (warning == SDK::CrWarning_Connect_Reconnecting) {
            emit("STATUS:RECONNECTING");
        }
    }

    void OnWarningExt(CrInt32u /*warning*/, CrInt32 /*p1*/,
                      CrInt32 /*p2*/, CrInt32 /*p3*/) override {}

    void OnError(CrInt32u error) override
    {
        // Connection timeouts are normal during initial handshake — don't treat as fatal
        if (error == 0x00008208) { // CrError_Connect_TimeOut
            std::fprintf(stderr, "[tether] Connection timeout (retrying internally)...\n");
            return;
        }
        std::string msg = "STATUS:ERROR:SDK_ERROR_0x";
        char buf[16];
        std::snprintf(buf, sizeof(buf), "%08X", error);
        msg += buf;
        emit(msg);
    }

    void OnCompleteOperation(CrInt32u /*code*/,
                             SDK::CrOperationResultData* /*resultData*/) override {}

    void OnNotifyFTPTransferResult(CrInt32u /*notify*/,
                                   CrInt32u /*numOfSuccess*/,
                                   CrInt32u /*numOfFail*/) override {}

    void OnNotifyRemoteTransferResult(CrInt32u /*notify*/, CrInt32u /*per*/,
                                      CrChar* /*filename*/) override {}

    void OnNotifyRemoteTransferResult(CrInt32u /*notify*/, CrInt32u /*per*/,
                                      CrInt8u* /*data*/, CrInt64u /*size*/) override {}

    void OnNotifyRemoteTransferContentsListChanged(CrInt32u /*notify*/,
                                                    CrInt32u /*slotNumber*/,
                                                    CrInt32u /*addSize*/) override {}

    void OnNotifyRemoteFirmwareUpdateResult(CrInt32u /*notify*/,
                                            const void* /*param*/) override {}

    void OnReceivePlaybackTimeCode(CrInt32u /*timeCode*/) override {}

    void OnReceivePlaybackData(CrInt8u /*mediaType*/, CrInt32 /*dataSize*/,
                               CrInt8u* /*data*/, CrInt64 /*pts*/, CrInt64 /*dts*/,
                               CrInt32 /*param1*/, CrInt32 /*param2*/) override {}

    void OnNotifyMonitorUpdated(CrInt32u /*type*/, CrInt32u /*frameNo*/) override {}

    void OnNotifyPostViewImage(CrChar* /*filename*/, CrInt32u /*size*/) override {}
};

// ---------------------------------------------------------------------------
// Helper: set the save directory via SDK::SetSaveInfo
// ---------------------------------------------------------------------------
static bool set_save_info(SDK::CrDeviceHandle handle, const std::string& dir)
{
    // SetSaveInfo wants a mutable CrChar* path, a prefix, and a start number.
    // -1 means auto-number (ImageSaveAutoStartNo in the sample).
    constexpr int kAutoNumber = -1;
    char pathBuf[256];
    std::memset(pathBuf, 0, sizeof(pathBuf));
    std::strncpy(pathBuf, dir.c_str(), sizeof(pathBuf) - 1);

    auto err = SDK::SetSaveInfo(handle, pathBuf, (char*)"", kAutoNumber);
    if (CR_FAILED(err)) {
        std::string msg = "STATUS:ERROR:SetSaveInfo_failed_0x";
        char buf[16];
        std::snprintf(buf, sizeof(buf), "%08X", (unsigned)err);
        msg += buf;
        emit(msg);
        return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Helper: set StillImageStoreDestination to HostPC (save to PC)
// ---------------------------------------------------------------------------
static bool set_save_to_pc(SDK::CrDeviceHandle handle)
{
    // Retry a few times — camera may not be ready immediately
    for (int attempt = 0; attempt < 5; attempt++) {
        SDK::CrDeviceProperty prop;
        prop.SetCode(SDK::CrDeviceProperty_StillImageStoreDestination);
        prop.SetCurrentValue(SDK::CrStillImageStoreDestination_HostPCAndMemoryCard);
        prop.SetValueType(SDK::CrDataType_UInt16);

        auto err = SDK::SetDeviceProperty(handle, &prop);
        if (!CR_FAILED(err)) {
            std::fprintf(stderr, "[tether] Store destination set to PC+Card\n");
            return true;
        }

        // Try HostPC only
        prop.SetCurrentValue(SDK::CrStillImageStoreDestination_HostPC);
        err = SDK::SetDeviceProperty(handle, &prop);
        if (!CR_FAILED(err)) {
            std::fprintf(stderr, "[tether] Store destination set to PC only\n");
            return true;
        }

        std::fprintf(stderr, "[tether] SetStoreDestination attempt %d failed (0x%08X), retrying...\n",
                     attempt + 1, (unsigned)err);
        std::this_thread::sleep_for(std::chrono::seconds(2));
    }
    emit("STATUS:ERROR:SetStoreDestination_failed");
    return false;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
int main(int argc, char* argv[])
{
    // ----- Parse arguments -----
    if (argc < 2) {
        std::fprintf(stderr, "Usage: %s <output_directory>\n", argv[0]);
        return 1;
    }

    g_outputDir = argv[1];

    // Ensure output directory exists
    {
        std::error_code ec;
        std::filesystem::create_directories(g_outputDir, ec);
        if (!std::filesystem::is_directory(g_outputDir)) {
            std::fprintf(stderr, "ERROR: Cannot create/access output directory: %s\n",
                         g_outputDir.c_str());
            return 1;
        }
    }

    // Make the output dir an absolute path
    {
        std::error_code ec;
        auto abs = std::filesystem::canonical(g_outputDir, ec);
        if (!ec) {
            g_outputDir = abs.string();
        }
    }

    // ----- Signal handling -----
    std::signal(SIGINT, sighandler);
    std::signal(SIGTERM, sighandler);

    // ----- Initialize SDK -----
    if (!SDK::Init(0)) {
        emit("STATUS:ERROR:SDK_Init_failed");
        SDK::Release();
        return 1;
    }

    // Persistent callback object (lives for the entire process)
    TetherCallback callback;
    SDK::CrDeviceHandle deviceHandle = 0;
    bool wasConnected = false;

    // ----- Main loop: enumerate -> connect -> tether -----
    while (g_running.load()) {

        // ===== ENUMERATE =====
        emit("STATUS:SEARCHING");

        SDK::ICrEnumCameraObjectInfo* cameraList = nullptr;
        auto enumErr = SDK::EnumCameraObjects(&cameraList, 3);
        if (CR_FAILED(enumErr) || cameraList == nullptr || cameraList->GetCount() == 0) {
            if (cameraList) cameraList->Release();
            // Wait and retry
            for (int i = 0; i < 30 && g_running.load(); ++i) {
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
            }
            continue;
        }

        // Pick the first camera
        auto* camInfo = cameraList->GetCameraObjectInfo(0);
        if (!camInfo) {
            cameraList->Release();
            std::this_thread::sleep_for(std::chrono::seconds(3));
            continue;
        }

        // Build a display name from model
        std::string cameraName;
        if (camInfo->GetModel()) {
            cameraName = camInfo->GetModel();
        } else {
            cameraName = "Unknown";
        }

        {
            std::string msg = "STATUS:FOUND:";
            msg += cameraName;
            emit(msg);
        }

        // ===== CONNECT (Remote Control mode, auto-reconnect ON) =====
        auto connectErr = SDK::Connect(
            const_cast<SDK::ICrCameraObjectInfo*>(camInfo),
            &callback,
            &deviceHandle,
            SDK::CrSdkControlMode_Remote,
            SDK::CrReconnecting_ON
        );

        cameraList->Release();
        cameraList = nullptr;

        if (CR_FAILED(connectErr)) {
            std::string msg = "STATUS:ERROR:Connect_failed_0x";
            char buf[16];
            std::snprintf(buf, sizeof(buf), "%08X", (unsigned)connectErr);
            msg += buf;
            emit(msg);
            // Wait and retry
            std::this_thread::sleep_for(std::chrono::seconds(3));
            continue;
        }

        // SDK::Connect() returned OK — the connection is being established.
        // Don't wait for OnConnected — the Sony SDK handles this asynchronously
        // and the timeout callback fires before OnConnected on some cameras.
        // Just proceed — the camera is connected enough for set_save_info and shooting.
        {
            std::string msg = "STATUS:CONNECTED:";
            msg += cameraName;
            emit(msg);
        }
        g_connected.store(true);
        wasConnected = true;

        // ===== SET SAVE INFO (download directory) =====
        if (!set_save_info(deviceHandle, g_outputDir)) {
            emit("STATUS:ERROR:set_save_info_failed");
        }

        // Wait for camera to settle
        std::this_thread::sleep_for(std::chrono::seconds(2));

        // Try to set store destination to PC (best effort — not all cameras support it)
        set_save_to_pc(deviceHandle);

        // ===== TETHERED =====
        emit("STATUS:TETHERED");
        std::fprintf(stderr, "[tether] Ready. Take photos — they will download automatically.\n");

        // Sit in a loop while connected. The SDK callbacks fire on
        // internal threads and call emit() for each captured file.
        while (g_connected.load() && g_running.load()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        }

        // ===== CLEANUP after disconnect =====
        if (deviceHandle != 0) {
            SDK::Disconnect(deviceHandle);
            SDK::ReleaseDevice(deviceHandle);
            deviceHandle = 0;
        }
        g_connected.store(false);

        if (!g_running.load()) break;

        // Camera disconnected unexpectedly; loop back to re-enumerate
        emit("STATUS:DISCONNECTED");
        std::this_thread::sleep_for(std::chrono::seconds(2));
    }

    // ===== SHUTDOWN =====
    if (deviceHandle != 0) {
        SDK::Disconnect(deviceHandle);
        SDK::ReleaseDevice(deviceHandle);
    }
    SDK::Release();

    return 0;
}
