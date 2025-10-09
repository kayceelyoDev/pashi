// /lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// Client-side Supabase (for browsers)
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server-side Supabase (for server actions, RSC, etc.)
export function supabaseServer() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get() {
          return undefined;
        },
      },
    }
  );
}
