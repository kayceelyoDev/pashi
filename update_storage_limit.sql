-- Update the 'shared-files' bucket to allow files up to 1GB (1073741824 bytes)
UPDATE storage.buckets
SET file_size_limit = 1073741824 -- 1GB
WHERE id = 'shared-files';
