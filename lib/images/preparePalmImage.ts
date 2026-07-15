const allowedPalmImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxOriginalSize = 20 * 1024 * 1024;
const maxFallbackOriginalSize = 4 * 1024 * 1024;
const targetUploadSize = 2.5 * 1024 * 1024;
const maxUploadSize = 4 * 1024 * 1024;
const maxLongestEdge = 1800;

function makePalmPreparationError(message: string) {
  const error = new Error(message);
  error.name = "PALM_PREPARATION_FAILED";
  return error;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(makePalmPreparationError("Could not prepare this palm photo."));
      },
      "image/jpeg",
      quality
    );
  });
}

async function createBitmap(file: File) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return await createImageBitmap(file);
    }
  }

  const url = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function preparePalmImage(file: File): Promise<File> {
  if (!allowedPalmImageTypes.includes(file.type)) {
    throw makePalmPreparationError(
      "This image format is not supported. Please upload JPG, PNG, or WEBP."
    );
  }

  if (file.size > maxOriginalSize) {
    throw makePalmPreparationError(
      "This photo is too large to process. Please choose a slightly smaller image."
    );
  }

  try {
    const image = await createBitmap(file);
    const sourceWidth = image.width;
    const sourceHeight = image.height;
    const scale = Math.min(
      1,
      maxLongestEdge / Math.max(sourceWidth, sourceHeight)
    );
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw makePalmPreparationError("Canvas unavailable.");
    }

    context.drawImage(image, 0, 0, width, height);

    if ("close" in image && typeof image.close === "function") {
      image.close();
    }

    let blob = await canvasToBlob(canvas, 0.82);

    if (blob.size > targetUploadSize) {
      blob = await canvasToBlob(canvas, 0.72);
    }

    if (blob.size > maxUploadSize) {
      throw makePalmPreparationError(
        "This photo is too large to process. Please choose a slightly smaller image."
      );
    }

    return new File([blob], "palm-upload.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "PALM_PREPARATION_FAILED") {
      throw error;
    }

    if (file.size <= maxFallbackOriginalSize) {
      return file;
    }

    throw makePalmPreparationError(
      "This photo could not be prepared. Please choose a clearer or slightly smaller image."
    );
  }
}
