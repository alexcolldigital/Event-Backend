const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Custom multer storage engine for cloudinary v2
const createCloudinaryStorage = (folder) => ({
  _handleFile(req, file, cb) {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `event-compass/${folder}`,
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return cb(error);
        cb(null, { path: result.secure_url, filename: result.public_id });
      }
    );
    file.stream.pipe(uploadStream);
  },
  _removeFile(req, file, cb) {
    cloudinary.uploader.destroy(file.filename, cb);
  },
});

const fileFilter = (req, file, cb) => {
  /jpeg|jpg|png|gif|webp/.test(file.mimetype)
    ? cb(null, true)
    : cb(new Error('Only image files are allowed'));
};

const limits = { fileSize: 10 * 1024 * 1024 };

const createUploadMiddleware = (folder, maxFiles = 5) =>
  multer({ storage: createCloudinaryStorage(folder), limits, fileFilter }).array('images', maxFiles);

const createSingleUploadMiddleware = (folder, fieldName = 'image') =>
  multer({ storage: createCloudinaryStorage(folder), limits, fileFilter }).single(fieldName);

const deleteImageFromCloudinary = async (publicId) => {
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
};

const uploadToCloudinary = async (file, folder) => {
  try {
    if (!file) throw new Error('No file provided');

    if (typeof file.path === 'string' && /^https?:\/\//.test(file.path)) {
      return { url: file.path, publicId: file.filename || null };
    }

    if (file.buffer) {
      const base64 = `data:${file.mimetype || 'application/octet-stream'};base64,${file.buffer.toString('base64')}`;
      const result = await cloudinary.uploader.upload(base64, {
        folder: `event-compass/${folder}`,
        resource_type: 'auto',
      });
      return { url: result.secure_url, publicId: result.public_id };
    }

    if (file.path) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: `event-compass/${folder}`,
        resource_type: 'auto',
      });
      return { url: result.secure_url, publicId: result.public_id };
    }

    throw new Error('Unsupported file payload for Cloudinary upload');
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
};

module.exports = {
  cloudinary,
  createUploadMiddleware,
  createSingleUploadMiddleware,
  deleteImageFromCloudinary,
  uploadToCloudinary,
};
