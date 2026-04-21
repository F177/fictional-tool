// Module-level store — survives client-side navigation, cleared on page refresh.
let _file: File | null = null;

export function storePdf(file: File) {
  _file = file;
}

export function getPdf(): File | null {
  return _file;
}
