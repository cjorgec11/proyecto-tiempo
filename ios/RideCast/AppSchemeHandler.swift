import Foundation
import WebKit

/// Sirve la web empaquetada en la app bajo `ridecast://localhost/`.
///
/// Con `file://` WebKit no carga los `<script type="module">` ni da un origen estable
/// para `localStorage`; un esquema propio resuelve las dos cosas.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "ridecast"
    static let host = "localhost"
    static let startURL = URL(string: "\(scheme)://\(host)/index.html")!

    // Solo se sirven ficheros web: nunca el ejecutable, Info.plist ni el catalogo de recursos.
    private static let contentTypes = [
        "html": "text/html; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
    ]

    private let root: URL

    init(root: URL = Bundle.main.resourceURL!) {
        self.root = root.standardizedFileURL
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let requestURL = urlSchemeTask.request.url ?? Self.startURL
        guard let file = resolve(requestURL),
              let contentType = Self.contentTypes[file.pathExtension.lowercased()],
              let data = try? Data(contentsOf: file)
        else {
            respond(urlSchemeTask, url: requestURL, status: 404, headers: ["Content-Type": "text/plain; charset=utf-8"], body: Data("Not found".utf8))
            return
        }
        respond(urlSchemeTask, url: requestURL, status: 200, headers: [
            "Content-Type": contentType,
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
        ], body: data)
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func resolve(_ url: URL) -> URL? {
        guard url.host == Self.host else { return nil }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/") else { return nil }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory), !isDirectory.boolValue else { return nil }
        return file
    }

    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, headers: [String: String], body: Data) {
        var headers = headers
        headers["Content-Length"] = String(body.count)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
    }
}
