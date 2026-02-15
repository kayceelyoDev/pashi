-- Add type column to rooms if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'type') THEN
        ALTER TABLE public.rooms ADD COLUMN "type" TEXT DEFAULT 'p2p';
    END IF;
END $$;

-- Create the files table
CREATE TABLE IF NOT EXISTS public.files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  room_code TEXT NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Allow public access (policies)
-- Create
CREATE POLICY "Enable insert for all users" ON public.files FOR INSERT WITH CHECK (true);

-- Read (so users in the room can list files)
CREATE POLICY "Enable select for all users" ON public.files FOR SELECT USING (true);

-- Delete (so users can delete after download)
CREATE POLICY "Enable delete for all users" ON public.files FOR DELETE USING (true);

-- Storage bucket setup (Optional: Run this if you haven't created the bucket yet)
-- insert into storage.buckets (id, name, public) values ('shared-files', 'shared-files', true);

-- Storage policies (Important for file access)
-- create policy "Public Access" on storage.objects for select using ( bucket_id = 'shared-files' );
-- create policy "Public Upload" on storage.objects for insert with check ( bucket_id = 'shared-files' );
-- create policy "Public Delete" on storage.objects for delete using ( bucket_id = 'shared-files' );
