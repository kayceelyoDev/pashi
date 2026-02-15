-- Allow public uploads to the 'shared-files' bucket
CREATE POLICY "Public Upload" ON storage.objects
FOR INSERT
WITH CHECK ( bucket_id = 'shared-files' );

-- Allow public access to read files from 'shared-files' bucket
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT
USING ( bucket_id = 'shared-files' );

-- Allow public deletion of files from 'shared-files' bucket
CREATE POLICY "Public Delete" ON storage.objects
FOR DELETE
USING ( bucket_id = 'shared-files' );
