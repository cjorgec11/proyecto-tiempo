import UIKit
import Capacitor

/// Controlador principal: el de Capacitor más los plugins propios de RideCast.
class RideCastViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ArchivoGpxPlugin())
    }
}

/// WKWebView no descarga los enlaces `<a download>` que usa la web para exportar GPX.
/// En iOS la web llama a este plugin, que abre la hoja de compartir para guardar
/// el archivo en Archivos, enviarlo o abrirlo en otra app (Garmin Connect, etc.).
@objc(ArchivoGpxPlugin)
public class ArchivoGpxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ArchivoGpxPlugin"
    public let jsName = "ArchivoGpx"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "compartir", returnType: CAPPluginReturnPromise)
    ]

    @objc func compartir(_ call: CAPPluginCall) {
        guard let contenido = call.getString("contenido"), !contenido.isEmpty else {
            call.reject("Falta el contenido del GPX.")
            return
        }
        var nombre = ((call.getString("nombre") ?? "") as NSString).lastPathComponent
        if nombre.isEmpty || nombre == "." || nombre == ".." { nombre = "ruta.gpx" }

        let carpeta = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let archivo = carpeta.appendingPathComponent(nombre)
        do {
            try FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
            try contenido.write(to: archivo, atomically: true, encoding: .utf8)
        } catch {
            call.reject("No se pudo preparar el GPX.")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let presentador = self?.bridge?.viewController else {
                try? FileManager.default.removeItem(at: carpeta)
                call.reject("No se pudo abrir el menú de compartir.")
                return
            }
            let hoja = UIActivityViewController(activityItems: [archivo], applicationActivities: nil)
            if let popover = hoja.popoverPresentationController {
                popover.sourceView = presentador.view
                popover.sourceRect = CGRect(x: presentador.view.bounds.midX, y: presentador.view.bounds.midY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
            hoja.completionWithItemsHandler = { _, completado, _, _ in
                try? FileManager.default.removeItem(at: carpeta)
                call.resolve(["compartido": completado])
            }
            presentador.present(hoja, animated: true)
        }
    }
}
