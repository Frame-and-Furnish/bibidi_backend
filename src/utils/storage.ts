import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export interface StoredFile {
  key: string;
  url: string;
  size: number;
  mimeType?: string;
  fileName: string;
}

interface SaveFileOptions {
  buffer: Buffer;
  originalName: string;
  folder: string;
  contentType?: string;
}

type StorageDriver = 'local' | 's3';

const driver: StorageDriver = (process.env.STORAGE_DRIVER as StorageDriver) || 'local';
const uploadsRoot = process.env.LOCAL_UPLOADS_DIR || path.resolve(process.cwd(), 'uploads');
const publicBaseUrl = process.env.STORAGE_PUBLIC_URL || '/uploads';

let s3Client: S3Client | null = null;

const getS3Client = (): S3Client => {
  if (s3Client) {
    return s3Client;
  }

  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;

  if (!region || !bucket) {
    throw new Error('S3 configuration missing. Please set S3_REGION and S3_BUCKET env vars.');
  }

  const config: any = { region };

  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
  }

  if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    };
  }

  s3Client = new S3Client(config);
  return s3Client;
};

const buildFileKey = (folder: string, originalName: string): { key: string; fileName: string; folder: string } => {
  const ext = path.extname(originalName) || '';
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const sanitizedFolder = folder
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const prefix = sanitizedFolder ? `${sanitizedFolder}/` : '';
  const key = `${prefix}${fileName}`.replace(/\\/g, '/');
  return { key, fileName, folder: sanitizedFolder };
};

const saveToLocal = async ({ buffer, originalName, folder, contentType }: SaveFileOptions): Promise<StoredFile> => {
  const { key, fileName, folder: sanitizedFolder } = buildFileKey(folder, originalName);
  const directoryPath = sanitizedFolder ? sanitizedFolder.split('/').join(path.sep) : '';
  const absoluteDir = path.join(uploadsRoot, directoryPath);
  await fs.mkdir(absoluteDir, { recursive: true });
  await fs.writeFile(path.join(uploadsRoot, key.split('/').join(path.sep)), buffer);

  const url = `${publicBaseUrl.replace(/\/$/, '')}/${key.replace(/\\/g, '/')}`;

  return {
    key,
    url,
    size: buffer.length,
    fileName,
    ...(contentType ? { mimeType: contentType } : {}),
  };
};

const saveToS3 = async ({ buffer, originalName, folder, contentType }: SaveFileOptions): Promise<StoredFile> => {
  const { key, fileName } = buildFileKey(folder, originalName);
  const bucket = process.env.S3_BUCKET;

  if (!bucket) {
    throw new Error('S3_BUCKET env variable is required when using S3 storage');
  }

  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const base = process.env.STORAGE_PUBLIC_URL
    || `https://${bucket}.s3${process.env.S3_REGION ? `.${process.env.S3_REGION}` : ''}.amazonaws.com`;

  const url = `${base.replace(/\/$/, '')}/${key}`;

  return {
    key,
    url,
    size: buffer.length,
    fileName,
    ...(contentType ? { mimeType: contentType } : {}),
  };
};

const deleteFromLocal = async (key: string): Promise<void> => {
  const target = path.join(uploadsRoot, key);
  try {
    await fs.unlink(target);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
};

const deleteFromS3 = async (key: string): Promise<void> => {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error('S3_BUCKET env variable is required when using S3 storage');
  }

  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
};

export const storageService = {
  async saveFile(options: SaveFileOptions): Promise<StoredFile> {
    if (driver === 's3') {
      return saveToS3(options);
    }
    return saveToLocal(options);
  },

  async deleteFile(key: string): Promise<void> {
    if (!key) return;
    if (driver === 's3') {
      await deleteFromS3(key);
      return;
    }
    await deleteFromLocal(key);
  },
};
