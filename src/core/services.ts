// Composition root: every I/O-capable service the app uses is wired and
// exported here as a ready-made singleton. Nothing outside this module
// should construct adapters or touch fetch/localStorage directly.

import { localStorageCache } from "@/core/cache/localStorageCache";
import { fetchAdapter } from "@/core/http/fetchAdapter";
import { googleFontsAdapter } from "@/core/fonts/googleFontsAdapter";
import { createNominatimAdapter } from "@/features/location/infrastructure/nominatimAdapter";

/* Geocoding (Nominatim, cached) */

const geocoder = createNominatimAdapter(fetchAdapter, localStorageCache);

export const searchLocations = geocoder.searchLocations;
export const geocodeLocation = geocoder.geocodeLocation;
export const reverseGeocodeCoordinates = geocoder.reverseGeocode;

/* Font loading */

export const ensureGoogleFont =
  googleFontsAdapter.ensureFont.bind(googleFontsAdapter);

/* Poster compositing */

export { compositeExport } from "@/features/poster/infrastructure/renderer";

/* Map capture + export encoders */

export { captureMapAsCanvas } from "@/features/export/infrastructure/mapExporter";
export { createPngBlob } from "@/features/export/infrastructure/pngExporter";
export { createLayeredSvgBlobFromMap } from "@/features/export/infrastructure/layeredSvgExporter";
export { createPdfBlobFromCanvas } from "@/features/export/infrastructure/pdfExporter";
export { createPosterFilename } from "@/features/export/infrastructure/filenameGenerator";
export { triggerDownloadBlob } from "@/features/export/infrastructure/fileDownloader";

/* GPX routes */

export { gpxParser } from "@/features/routes/infrastructure/gpxParser";
export { drawRoutesOnCanvas } from "@/features/routes/infrastructure/rendering";
