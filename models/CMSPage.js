const mongoose = require('mongoose');

const cmsPageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    content: { type: String, required: true },
    excerpt: String,
    metaTitle: String,
    metaDescription: String,
    type: { type: String, enum: ['page', 'faq', 'policy', 'blog'], default: 'page' },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    publishedAt: Date,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tags: [String],
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CMSPage', cmsPageSchema);
