import SwiftUI

@main
struct StudioRelayClipApp: App {
    @StateObject private var store = PhotoStore()

    var body: some Scene {
        WindowGroup {
            ContentView(store: store)
        }
    }
}
