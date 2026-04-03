import SwiftUI

@main
struct StudioRelayApp: App {
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 20) {
                Spacer()
                Text("StudioRelay")
                    .font(.system(size: 11, weight: .light))
                    .tracking(3)
                    .textCase(.uppercase)
                    .foregroundColor(Color(white: 0.3))
                Text("Photo Delivery")
                    .font(.system(size: 28, weight: .light))
                    .foregroundColor(.white)
                Text("This app works with StudioRelay\nphoto sessions. Scan a QR code\nto get your photos.")
                    .font(.system(size: 14, weight: .light))
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)
                Spacer()
                Text("studiorelay.com")
                    .font(.system(size: 11, weight: .light))
                    .tracking(2)
                    .foregroundColor(Color(white: 0.15))
                    .padding(.bottom, 30)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.black)
            .preferredColorScheme(.dark)
        }
    }
}
