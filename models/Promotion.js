const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: String,
    type: { type: String, enum: ['banner', 'featured_service', 'discount_campaign', 'flash_sale'], required: true },
    image: { url: String, publicId: String },
    targetServices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],
    targetCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    discountPercentage: { type: Number, min: 0, max: 100 },
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Promotion', promotionSchema);
