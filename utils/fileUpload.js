/**
 * File Upload Utility
 * Handles file uploads to Cloudinary
 */

const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Create Cloudinary storage for multer
 */
const createCloudinaryStorage = (folder) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: `event-compass/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      resource_type: 'auto',
    },
  });
};

/**
 * Create multer upload middleware for multiple files
 */
const createUploadMiddleware = (folder, maxFiles = 5) => {
  const storage = createCloudinaryStorage(folder);

  return multer({
    storage: storage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extname = allowedTypes.test(file.mimetype);

      if (extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    },
  }).array('images', maxFiles);
};

/**
 * Create multer upload middleware for single file
 */
const createSingleUploadMiddleware = (folder, fieldName = 'image') => {
  const storage = createCloudinaryStorage(folder);

  return multer({
    storage: storage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extname = allowedTypes.test(file.mimetype);

      if (extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    },
  }).single(fieldName);
};

/**
 * Delete image from Cloudinary
 */
const deleteImageFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
};

/**
 * Upload single file to Cloudinary
 */
const uploadToCloudinary = async (file, folder) => {
  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder: `event-compass/${folder}`,
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
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
