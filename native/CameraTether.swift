import Foundation
import AppKit
import ImageCaptureCore

// Stderr helper
var standardError = FileHandle.standardError
extension FileHandle: @retroactive TextOutputStream {
    public func write(_ string: String) {
        self.write(Data(string.utf8))
    }
}

class TetherDelegate: NSObject, NSApplicationDelegate, ICDeviceBrowserDelegate, ICCameraDeviceDelegate, ICCameraDeviceDownloadDelegate {
    let outputDir: String
    let browser = ICDeviceBrowser()
    var camera: ICCameraDevice?

    init(outputDir: String) {
        self.outputDir = outputDir
        super.init()
        try? FileManager.default.createDirectory(atPath: outputDir, withIntermediateDirectories: true)
    }

    func output(_ msg: String) {
        print(msg, terminator: "\n")
        fflush(stdout)
    }

    // MARK: - NSApplicationDelegate

    func applicationDidFinishLaunching(_ notification: Notification) {
        browser.delegate = self
        browser.start()
        output("STATUS:SEARCHING")
        print("Searching for cameras...", to: &standardError)
    }

    // MARK: - ICDeviceBrowserDelegate

    func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {
        guard let cam = device as? ICCameraDevice else { return }
        output("STATUS:FOUND:\(cam.name ?? "Unknown")")
        print("Found: \(cam.name ?? "Unknown")", to: &standardError)
        camera = cam
        cam.delegate = self
        cam.requestOpenSession()
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {
        if let cam = device as? ICCameraDevice, cam === camera {
            output("STATUS:DISCONNECTED")
            print("Disconnected", to: &standardError)
            camera = nil
        }
    }

    // MARK: - ICCameraDeviceDelegate

    func cameraDevice(_ camera: ICCameraDevice, didAdd items: [ICCameraItem]) {
        for item in items {
            guard let file = item as? ICCameraFile else { continue }
            let name = file.name ?? "photo_\(Int(Date().timeIntervalSince1970))"
            output("NEWFILE:\(name)")

            let opts: [ICDownloadOption: Any] = [
                .downloadsDirectoryURL: URL(fileURLWithPath: outputDir),
                .overwrite: true,
            ]
            camera.requestDownloadFile(file, options: opts, downloadDelegate: self, didDownloadSelector: #selector(didDownload(_:error:options:contextInfo:)), contextInfo: nil)
        }
    }

    func cameraDevice(_ camera: ICCameraDevice, didRemove items: [ICCameraItem]) {}
    func cameraDevice(_ camera: ICCameraDevice, didRenameItems items: [ICCameraItem]) {}
    func cameraDevice(_ camera: ICCameraDevice, didReceivePTPEvent eventData: Data) {}
    func cameraDevice(_ camera: ICCameraDevice, didReceiveMetadata metadata: [AnyHashable: Any]?, for item: ICCameraItem, error: (any Error)?) {}
    func cameraDevice(_ camera: ICCameraDevice, didReceiveThumbnail thumbnail: CGImage?, for item: ICCameraItem, error: (any Error)?) {}
    func cameraDeviceDidChangeCapability(_ camera: ICCameraDevice) {}
    func cameraDeviceDidRemoveAccessRestriction(_ device: ICDevice) {}
    func cameraDeviceDidEnableAccessRestriction(_ device: ICDevice) {}

    func deviceDidBecomeReady(withCompleteContentCatalog device: ICCameraDevice) {
        output("STATUS:CONNECTED:\(device.name ?? "Unknown")")
        output("STATUS:TETHERED")
        print("Tethered capture active: \(device.name ?? "Unknown")", to: &standardError)
    }

    func didRemove(_ device: ICDevice) {
        if camera === device as? ICCameraDevice {
            output("STATUS:DISCONNECTED")
            camera = nil
        }
    }

    func device(_ device: ICDevice, didCloseSessionWithError error: (any Error)?) {}
    func device(_ device: ICDevice, didOpenSessionWithError error: (any Error)?) {
        if let error = error {
            output("STATUS:ERROR:\(error.localizedDescription)")
        }
    }

    // MARK: - Download

    @objc func didDownload(_ file: ICCameraFile, error: (any Error)?, options: [String: Any] = [:], contextInfo: UnsafeMutableRawPointer?) {
        if let error = error {
            output("ERROR:DOWNLOAD:\(error.localizedDescription)")
            return
        }
        if let savedName = options[ICDownloadOption.savedFilename.rawValue] as? String
            ?? options["ICSavedFilename"] as? String {
            let fullPath = (outputDir as NSString).appendingPathComponent(savedName)
            output("CAPTURED:\(fullPath)")
            print("Downloaded: \(fullPath)", to: &standardError)
        }
    }
}

// MARK: - Main

guard CommandLine.arguments.count > 1 else {
    print("Usage: camera-tether <output-directory>")
    exit(1)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // No dock icon
let delegate = TetherDelegate(outputDir: CommandLine.arguments[1])
app.delegate = delegate
app.run()
