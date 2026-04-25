"use client";

import { Capacitor } from "@capacitor/core";

async function saveNative(bytes: Uint8Array, filename: string) {
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");

  // Convert bytes to base64
  const base64 = btoa(String.fromCharCode(...bytes));

  // Write to app cache directory
  const result = await Filesystem.writeFile({
    path     : filename,
    data     : base64,
    directory: Directory.Cache,
    encoding : Encoding.UTF8 as never, // binary, not utf8 — cast needed
  });

  // Open native share sheet (Save to Downloads, WhatsApp, Drive, etc.)
  await Share.share({
    title : filename,
    url   : result.uri,
    dialogTitle: "Save or share your PDF",
  });
}

function saveBrowser(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function savePdf(bytes: Uint8Array, filename: string) {
  if (Capacitor.isNativePlatform()) {
    await saveNative(bytes, filename);
  } else {
    saveBrowser(bytes, filename);
  }
}
