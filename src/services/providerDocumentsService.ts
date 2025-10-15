import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db/connectDB';
import { providerDocuments } from '../db/schema';

export interface ProviderDocumentInput {
  providerId: string;
  documentType: string;
  fileUrl: string;
  storageKey?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedBy?: string | null;
}

export const insertProviderDocuments = async (documents: ProviderDocumentInput[]) => {
  if (documents.length === 0) {
    return [];
  }

  const withIds = documents.map((doc) => ({
    id: randomUUID(),
    providerId: doc.providerId,
    documentType: doc.documentType,
    fileUrl: doc.fileUrl,
    storageKey: doc.storageKey ?? null,
    fileName: doc.fileName ?? null,
    mimeType: doc.mimeType ?? null,
    fileSize: doc.fileSize ?? null,
    uploadedBy: doc.uploadedBy ?? null,
  }));

  return db.insert(providerDocuments).values(withIds).returning();
};

export const getProviderDocuments = async (providerId: string) => {
  return db.select().from(providerDocuments).where(eq(providerDocuments.providerId, providerId));
};

export const deleteProviderDocumentRecord = async (providerId: string, documentId: string) => {
  const [existing] = await db
    .select()
    .from(providerDocuments)
    .where(and(eq(providerDocuments.id, documentId), eq(providerDocuments.providerId, providerId)));

  if (!existing) {
    return null;
  }

  await db
    .delete(providerDocuments)
    .where(and(eq(providerDocuments.id, documentId), eq(providerDocuments.providerId, providerId)));

  return existing;
};
