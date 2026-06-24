/** StorageBackend do FileService apoiado no Supabase Storage. */
import type { StorageBackend } from "../../src/services/fileService.js";
import { supabase, STORAGE_BUCKET } from "./client.js";

/** Cria um StorageBackend que guarda os ficheiros no bucket público. */
export function createSupabaseStorageBackend(): StorageBackend {
  return {
    async put(key: string, content: Uint8Array, contentType: string): Promise<string> {
      const blob = new Blob([content], { type: contentType });
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(key, blob, { contentType, upsert: true });
      if (error) {
        throw new Error(`Falha ao guardar o ficheiro no Storage: ${error.message}`);
      }
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(key);
      return data.publicUrl;
    },
  };
}
