export function editRecord(record, save) {
  const dialog = document.createElement("dialog"); dialog.className = "account-dialog data-editor";
  const title = document.createElement("h2"); title.textContent = "Editar ruta";
  const form = document.createElement("form");
  const label = document.createElement("label"); label.textContent = "Nombre";
  const name = document.createElement("input"); name.value = record.name; name.required = true; name.maxLength = 100; label.append(name);
  const details = document.createElement("details"), summary = document.createElement("summary"); summary.textContent = "Datos completos";
  const text = document.createElement("textarea"); text.rows = 16; text.setAttribute("aria-label", "Datos de la ruta en JSON"); text.value = JSON.stringify(record, null, 2); details.append(summary, text);
  const status = document.createElement("p"); status.setAttribute("role", "status");
  const submit = document.createElement("button"); submit.type = "submit"; submit.className = "primary-button"; submit.textContent = "Guardar cambios";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "secondary-button"; cancel.textContent = "Cancelar"; cancel.onclick = () => dialog.close();
  form.append(label, details, status, submit, cancel); dialog.append(title, form); document.body.append(dialog);
  const reset = () => dialog.close(); window.addEventListener("ridecast:account", reset);
  dialog.addEventListener("close", () => { window.removeEventListener("ridecast:account", reset); dialog.remove(); });
  form.addEventListener("submit", async event => {
    event.preventDefault(); submit.disabled = true;
    try { const data = JSON.parse(text.value); await save({ ...data, id: record.id, name: name.value.trim() }); dialog.close(); }
    catch (error) { status.textContent = error instanceof SyntaxError ? "Revisa el formato de los datos." : error.message; }
    finally { submit.disabled = false; }
  });
  dialog.showModal();
}
