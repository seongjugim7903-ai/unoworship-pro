-- 찬양대 장문 요청의 전송 용량을 줄이기 위해 고품질 WebP 저장을 허용한다.

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/png', 'image/webp']
where id = 'choir-generated-images';
