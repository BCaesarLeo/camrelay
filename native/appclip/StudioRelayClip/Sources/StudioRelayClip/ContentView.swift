import SwiftUI
import Photos

// MARK: - Photo Store

struct PhotoItem: Identifiable {
    let id: String
    let thumbnailURL: URL
    let fullURL: URL
    var saved: Bool = false
}

@MainActor
class PhotoStore: ObservableObject {
    @Published var photos: [PhotoItem] = []
    @Published var status: String = ""
    @Published var saving = false
    @Published var savedCount = 0
    @Published var totalCount = 0
    @Published var allSaved = false
    @Published var eventName: String = "StudioRelay"
    @Published var loading = false
    @Published var serverURL: String = ""
    @Published var needsURL = true

    func loadFromServer(_ base: String, token: String) {
        loading = true
        needsURL = false
        status = "Loading photos..."

        guard let apiURL = URL(string: "\(base)/dl/\(token)/api") else {
            status = "Invalid URL"
            loading = false
            return
        }

        URLSession.shared.dataTask(with: apiURL) { [weak self] data, _, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if let error = error {
                    self.status = "Connection failed: \(error.localizedDescription)"
                    self.loading = false
                    return
                }
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let photoArray = json["photos"] as? [[String: String]],
                      let name = json["eventName"] as? String else {
                    self.status = "Failed to load photos"
                    self.loading = false
                    return
                }
                self.eventName = name
                self.photos = photoArray.compactMap { dict in
                    guard let id = dict["id"],
                          let thumb = dict["thumbnail"],
                          let full = dict["full"],
                          let thumbURL = URL(string: "\(base)\(thumb)"),
                          let fullURL = URL(string: "\(base)\(full)") else { return nil }
                    return PhotoItem(id: id, thumbnailURL: thumbURL, fullURL: fullURL)
                }
                self.totalCount = self.photos.count
                self.status = "\(self.photos.count) photos ready"
                self.loading = false
            }
        }.resume()
    }

    func saveAllToPhotos() {
        guard !saving else { return }
        saving = true
        savedCount = 0
        allSaved = false
        status = "Requesting access..."

        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] authStatus in
            guard authStatus == .authorized || authStatus == .limited else {
                DispatchQueue.main.async {
                    self?.status = "Photo access denied. Go to Settings > Privacy > Photos."
                    self?.saving = false
                }
                return
            }
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                for i in 0..<self.photos.count {
                    self.status = "Saving \(i + 1) of \(self.totalCount)..."
                    do {
                        let (data, _) = try await URLSession.shared.data(from: self.photos[i].fullURL)
                        try await PHPhotoLibrary.shared().performChanges {
                            let request = PHAssetCreationRequest.forAsset()
                            request.addResource(with: .photo, data: data, options: nil)
                        }
                        self.photos[i].saved = true
                        self.savedCount += 1
                    } catch {
                        // Continue with next photo
                    }
                }
                self.allSaved = self.savedCount == self.totalCount
                self.status = self.allSaved ? "All \(self.totalCount) photos saved!" : "\(self.savedCount) of \(self.totalCount) saved"
                self.saving = false
            }
        }
    }
}

// MARK: - Content View

struct ContentView: View {
    @ObservedObject var store: PhotoStore
    @State private var urlInput: String = "http://192.168.0.173:3100/dl/ermxHpzzU8XgsAwZYiM8r"

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if store.needsURL {
                // Manual URL entry (for testing — in production the App Clip gets URL automatically)
                VStack(spacing: 20) {
                    Text("StudioRelay")
                        .font(.system(size: 11, weight: .light))
                        .tracking(3)
                        .textCase(.uppercase)
                        .foregroundColor(Color(white: 0.3))

                    Text("Enter download link")
                        .font(.system(size: 20, weight: .light))
                        .foregroundColor(.white)

                    TextField("http://192.168.x.x:3100/dl/token", text: $urlInput)
                        .textFieldStyle(.plain)
                        .padding(14)
                        .background(Color(white: 0.08))
                        .foregroundColor(.white)
                        .font(.system(size: 14, weight: .light, design: .monospaced))
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .padding(.horizontal, 20)

                    Button("Load Photos") {
                        parseAndLoad(urlInput)
                    }
                    .font(.system(size: 14, weight: .regular))
                    .tracking(1.5)
                    .textCase(.uppercase)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Color(red: 0.26, green: 0.33, blue: 1.0))
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)

                    // Paste from clipboard
                    Button("Paste from Clipboard") {
                        if let clip = UIPasteboard.general.string {
                            urlInput = clip
                            parseAndLoad(clip)
                        }
                    }
                    .font(.system(size: 13, weight: .light))
                    .foregroundColor(.gray)
                }
            } else if store.loading {
                VStack(spacing: 16) {
                    ProgressView().tint(.white)
                    Text("Loading your photos...")
                        .font(.system(size: 14, weight: .light))
                        .foregroundColor(.gray)
                }
            } else {
                // Main photo view
                VStack(spacing: 0) {
                    // Header
                    VStack(spacing: 4) {
                        Text(store.eventName)
                            .font(.system(size: 11, weight: .light))
                            .tracking(3)
                            .textCase(.uppercase)
                            .foregroundColor(Color(white: 0.3))
                            .padding(.top, 16)

                        Text("Your photos")
                            .font(.system(size: 22, weight: .light))
                            .foregroundColor(.white)

                        Text("\(store.photos.count) photos")
                            .font(.system(size: 13, weight: .light))
                            .foregroundColor(.gray)
                            .padding(.bottom, 12)
                    }

                    // Save button
                    Button(action: { store.saveAllToPhotos() }) {
                        HStack(spacing: 8) {
                            if store.saving {
                                ProgressView().tint(.white).scaleEffect(0.8)
                            }
                            Image(systemName: store.allSaved ? "checkmark.circle.fill" : "arrow.down.to.line")
                                .font(.system(size: 16))
                            Text(buttonText)
                                .font(.system(size: 15, weight: .regular))
                                .tracking(1.5)
                                .textCase(.uppercase)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(store.allSaved ? Color(red: 0.18, green: 0.83, blue: 0.66) : Color(red: 0.26, green: 0.33, blue: 1.0))
                        .foregroundColor(.white)
                    }
                    .disabled(store.saving || store.allSaved)
                    .opacity(store.saving ? 0.7 : 1)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 4)

                    // Status
                    if !store.status.isEmpty {
                        Text(store.status)
                            .font(.system(size: 12, weight: .light))
                            .foregroundColor(.gray)
                            .padding(.bottom, 8)
                    }

                    // Photo grid
                    ScrollView {
                        LazyVGrid(columns: [
                            GridItem(.flexible(), spacing: 3),
                            GridItem(.flexible(), spacing: 3),
                            GridItem(.flexible(), spacing: 3)
                        ], spacing: 3) {
                            ForEach(store.photos) { photo in
                                ZStack(alignment: .bottomTrailing) {
                                    AsyncImage(url: photo.thumbnailURL) { image in
                                        image.resizable().aspectRatio(3/2, contentMode: .fill).clipped()
                                    } placeholder: {
                                        Rectangle().fill(Color(white: 0.1)).aspectRatio(3/2, contentMode: .fill)
                                    }

                                    if photo.saved {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.system(size: 18))
                                            .foregroundColor(Color(red: 0.18, green: 0.83, blue: 0.66))
                                            .padding(6)
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 2)
                    }

                    Text("StudioRelay")
                        .font(.system(size: 10, weight: .light))
                        .tracking(2)
                        .textCase(.uppercase)
                        .foregroundColor(Color(white: 0.12))
                        .padding(.vertical, 12)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var buttonText: String {
        if store.allSaved { return "Saved to Photos" }
        if store.saving { return "Saving \(store.savedCount)/\(store.totalCount)..." }
        return "Save All to Photos"
    }

    private func parseAndLoad(_ urlString: String) {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              let host = url.host else {
            store.status = "Invalid URL"
            return
        }
        let base = "\(url.scheme ?? "http")://\(host)\(url.port.map { ":\($0)" } ?? "")"
        let components = url.pathComponents
        guard let dlIdx = components.firstIndex(of: "dl"),
              dlIdx + 1 < components.count else {
            store.status = "URL must contain /dl/token"
            return
        }
        let token = components[dlIdx + 1]
        store.loadFromServer(base, token: token)
    }
}
