import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type Todo = Database["public"]["Tables"]["todos"]["Row"];

export function createSharedClient(
  supabaseUrl: string,
  supabaseAnonKey: string
): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}

export async function listTodos(client: SupabaseClient<Database>): Promise<Todo[]> {
  const { data, error } = await client
    .from("todos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function addTodo(client: SupabaseClient<Database>, title: string): Promise<void> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return;

  const { error } = await client.from("todos").insert({ title: trimmedTitle });
  if (error) {
    throw new Error(error.message);
  }
}
