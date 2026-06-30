import { BadRequestException } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { basename, extname, join } from 'path';
import { nanoid } from 'nanoid';
import { diskStorage } from 'multer';

export const RESTAURANT_IMAGE_UPLOAD_ROOT = join(process.cwd(), 'uploads');
export const RESTAURANT_IMAGE_UPLOAD_DIR = join(
  RESTAURANT_IMAGE_UPLOAD_ROOT,
  'restaurant-images',
);
export const RESTAURANT_IMAGE_PUBLIC_PREFIX = '/uploads/restaurant-images';
export const RESTAURANT_IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

mkdirSync(RESTAURANT_IMAGE_UPLOAD_ROOT, { recursive: true });
mkdirSync(RESTAURANT_IMAGE_UPLOAD_DIR, { recursive: true });

function resolveImageExtension(file: Express.Multer.File) {
  const originalExtension = extname(file.originalname).toLowerCase();
  if (ALLOWED_IMAGE_EXTENSIONS.has(originalExtension)) {
    return originalExtension;
  }

  if (file.mimetype === 'image/jpeg') {
    return '.jpg';
  }

  if (file.mimetype === 'image/png') {
    return '.png';
  }

  if (file.mimetype === 'image/webp') {
    return '.webp';
  }

  return undefined;
}

export function buildRestaurantImagePublicUrl(fileName: string) {
  return `${RESTAURANT_IMAGE_PUBLIC_PREFIX}/${fileName}`;
}

export function resolveRestaurantImageFilePath(publicUrl: string) {
  if (!publicUrl.startsWith(`${RESTAURANT_IMAGE_PUBLIC_PREFIX}/`)) {
    return null;
  }

  const fileName = basename(publicUrl);
  return join(RESTAURANT_IMAGE_UPLOAD_DIR, fileName);
}

export const restaurantImageMulterOptions = {
  storage: diskStorage({
    destination: (
      _request: Express.Request,
      _file: Express.Multer.File,
      callback,
    ) => {
      mkdirSync(RESTAURANT_IMAGE_UPLOAD_DIR, { recursive: true });
      callback(null, RESTAURANT_IMAGE_UPLOAD_DIR);
    },
    filename: (
      _request: Express.Request,
      file: Express.Multer.File,
      callback,
    ) => {
      const extension = resolveImageExtension(file);

      if (!extension) {
        callback(
          new BadRequestException(
            'Only jpg, jpeg, png, and webp images are allowed',
          ),
          '',
        );
        return;
      }

      callback(null, `restaurant-${Date.now()}-${nanoid(12)}${extension}`);
    },
  }),
  fileFilter: (
    _request: Express.Request,
    file: Express.Multer.File,
    callback,
  ) => {
    const extension = extname(file.originalname).toLowerCase();
    const isAllowed =
      ALLOWED_IMAGE_EXTENSIONS.has(extension) &&
      ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype);

    if (!isAllowed) {
      callback(
        new BadRequestException(
          'Only jpg, jpeg, png, and webp images are allowed',
        ),
        false,
      );
      return;
    }

    callback(null, true);
  },
  limits: {
    fileSize: RESTAURANT_IMAGE_MAX_FILE_SIZE,
  },
};
