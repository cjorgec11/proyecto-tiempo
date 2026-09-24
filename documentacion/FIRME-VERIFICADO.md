# Biblioteca local de firme verificado

El modo predeterminado es **Preferencia de terreno**. Busca con el perfil de asfalto o montaña y prioriza recorridos compatibles con los datos disponibles. Si solo encuentra geometrías válidas con superficie desconocida, puede ofrecer un **candidato para revisar**, con el aviso de firme sin confirmar. En asfalto no admite como candidato un trazado con tierra conocida; en montaña conserva el máximo del 25 % de pavimento conocido. Se mantienen los límites de distancia, cierre y repetición.

El modo opcional **Firme verificado** busca circuitos exclusivamente dentro de la biblioteca publicada en `cliente/red-verificada.js`. No utiliza BRouter ni conecta huecos con líneas o recorridos sin comprobar. Al seleccionarlo, la interfaz indica si existen tramos vigentes del firme elegido antes de comenzar la búsqueda.

La biblioteca inicial de Arnedo está vacía: los resultados de BRouter anteriores no constituyen comprobaciones del terreno. Para ofrecer recorridos verificados hacen falta evidencias reales de todos sus tramos.

## Incorporar tramos

1. Recopilar la geometría completa y la superficie de cada tramo a partir de una comprobación sobre el terreno o de documentación fiable del gestor de la vía. Registrar también el permiso para bicicletas y el sentido de circulación.
2. Documentar una fuente consultable, la persona responsable de revisarla, la fecha de comprobación y una fecha límite para volver a revisarla. La fecha de modificación del mapa, por sí sola, no acredita una inspección del firme.
3. Dividir la geometría cuando cambie el firme o exista una conexión utilizable. Los extremos compartidos deben tener exactamente las mismas coordenadas. No duplicar una vía como distintos tramos superpuestos ni crear líneas entre puntos alejados sin su trazado real.
4. Preparar un JSON con el catálogo completo y ejecutar `node herramientas/importar-tramos-verificados.mjs archivo.json` desde la raíz. Este comando valida la estructura y **sustituye** el catálogo anterior. Conservar el archivo original y revisar los cambios antes de publicar.
5. Volver a compilar/publicar cuando corresponda; las aplicaciones empaquetadas necesitan actualizar sus recursos para recibir nuevos tramos.

Estructura del catálogo: `{ "version": 1, "area": "Arnedo y alrededores", "tramos": [] }`.

Cada tramo debe contener estos campos:

| Campo | Contenido |
| --- | --- |
| `id` | Identificador único y estable |
| `coords` | Array del trazado completo: objetos con `lat` y `lon` numéricos |
| `surface` | `asphalt`, `ground`, `dirt`, `gravel`, `fine_gravel`, `compacted` o `earth` |
| `direction` | `both` para ambos sentidos, o `forward` siguiendo el orden de coordenadas |
| `bicycleAllowed` | `true`, respaldado por la comprobación de acceso |
| `source` | Referencia pública y consultable de la evidencia, URL o identificador documental |
| `reviewedBy` | Nombre o identificador público del responsable de la revisión |
| `checkedAt` | Fecha real de comprobación, `AAAA-MM-DD` |
| `validUntil` | Fecha límite de vigencia, `AAAA-MM-DD`, igual o posterior a la comprobación |

Todo el catálogo se distribuye con la web; no incluir datos personales privados ni documentos confidenciales. El importador valida formato y coherencia, no certifica la veracidad de una declaración. La revisión de evidencias sigue siendo humana.

## Criterios de generación

- Asfalto exige `asphalt`; hormigón y pavimento genérico no se equiparan a asfalto.
- Montaña admite únicamente las superficies no asfaltadas de la lista anterior, sin estimaciones ni enlaces asfaltados.
- Una revisión futura o caducada se excluye. La aplicación muestra fuentes, responsables y fechas del circuito generado.
- La salida debe estar a menos de 25 metros de un extremo utilizable. El circuito comienza en ese extremo; el acceso desde el punto pulsado no se incluye ni se certifica. El selector de salidas permite escoger un extremo exacto.
- La distancia debe quedar dentro del 5 % del objetivo. Se rechazan recorridos con más del 20 % de geometría repetida y no se reutiliza un mismo tramo.
- La orientación es una preferencia entre los circuitos disponibles. La búsqueda es acotada (20.000 estados explorados, 1.000 pendientes y 100 tramos por camino); si se agota sin resultado se informa, sin afirmar que se han explorado todas las posibilidades.

“Verificado” significa que cada tramo tiene evidencia revisada vigente en este catálogo. No garantiza ausencia de obras, barro, cambios de acceso ni alteraciones posteriores. La geometría exportada en GPX no incorpora un certificado. Al guardar en la cuenta, la API conserva la preferencia de superficie, pero no una acreditación de vigencia: volver a generar para comprobar la biblioteca actual.

## Pruebas

`node --test pruebas/rutas-verificadas.test.mjs` comprueba geometría, exclusión por firme, caducidad, fechas futuras, permisos, sentidos, huecos y cancelación con datos sintéticos que nunca se publican en la biblioteca.
