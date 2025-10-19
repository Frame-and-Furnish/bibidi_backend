import multer from 'multer';

const maxFileSizeMb = parseInt(process.env.UPLOAD_MAX_FILE_MB || '15', 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024,
  },
});

export const singleFileUpload = upload.single('file');
export default upload;
