require('dotenv').config();
const mongoose = require('mongoose');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected');

  const User = require('../models/User');
  const Service = require('../models/Service');
  const Booking = require('../models/Booking');
  const Payment = require('../models/Payment');
  const Category = require('../models/Category');
  const Coupon = require('../models/Coupon');
  const Promotion = require('../models/Promotion');
  const Notification = require('../models/Notification');
  const CMSPage = require('../models/CMSPage');
  const Review = require('../models/Review');
  const AuditLog = require('../models/AuditLog');
  const PlatformSetting = require('../models/PlatformSetting');

  const admin = await User.findOne({ role: 'admin' });
  const clients = await User.find({ role: 'client' });
  const providers = await User.find({ role: 'service_provider' });
  const services = await Service.find();

  console.log(`Found: ${clients.length} clients, ${providers.length} providers, ${services.length} services`);

  // Remaining bookings
  const scenarios = [
    { i: 2, ci: 2, si: 2, pi: 1, status: 'pending', amount: 120000, days: 14 },
    { i: 3, ci: 0, si: 3, pi: 2, status: 'cancelled', amount: 350000, days: -14 },
    { i: 4, ci: 1, si: 0, pi: 0, status: 'completed', amount: 250000, days: -30 },
    { i: 5, ci: 2, si: 1, pi: 0, status: 'confirmed', amount: 180000, days: 7 },
  ];

  for (const sc of scenarios) {
    const bn = 'BK2025' + String(sc.i + 1).padStart(4, '0');
    if (await Booking.findOne({ bookingNumber: bn })) continue;
    try {
      const doc = {
        bookingNumber: bn, bookingType: 'service',
        client: clients[sc.ci]._id, serviceProvider: providers[sc.pi]._id,
        service: services[sc.si]._id, status: sc.status,
        eventDate: new Date(Date.now() + sc.days * 86400000),
        numberOfGuests: 50 + sc.i * 20,
        pricing: { basePrice: sc.amount, totalAmount: sc.amount },
      };
      if (sc.status === 'completed') doc.completedDate = new Date();
      if (sc.status === 'confirmed') doc.confirmedDate = new Date();
      if (sc.status === 'cancelled') { doc.cancelledDate = new Date(); doc.cancellationReason = 'Client request'; }
      const b = await Booking.collection.insertOne({ ...doc, createdAt: new Date(), updatedAt: new Date() });
      console.log('Booking:', bn, sc.status);
      if (['completed', 'confirmed'].includes(sc.status)) {
        await Payment.create({ transactionId: 'TXN2025' + String(sc.i + 1).padStart(4, '0'), booking: b.insertedId, payer: clients[sc.ci]._id, payee: providers[sc.pi]._id, amount: sc.amount, platformFee: Math.round(sc.amount * 0.1), payeeAmount: Math.round(sc.amount * 0.9), status: 'completed', paymentMethod: 'card' });
      }
    } catch (e) { console.error('Booking error:', bn, e.message); }
  }

  // Payments for BK20250001 and BK20250002
  const b1 = await Booking.findOne({ bookingNumber: 'BK20250001' });
  const b2 = await Booking.findOne({ bookingNumber: 'BK20250002' });
  const b5 = await Booking.findOne({ bookingNumber: 'BK20250005' });
  const b6 = await Booking.findOne({ bookingNumber: 'BK20250006' });
  const payDocs = [
    b1 && { transactionId: 'TXN20250001', booking: b1._id, payer: clients[0]._id, payee: providers[0]._id, amount: 250000, platformFee: 25000, payeeAmount: 225000, status: 'completed', paymentMethod: 'card', currency: 'NGN' },
    b2 && { transactionId: 'TXN20250002', booking: b2._id, payer: clients[1]._id, payee: providers[0]._id, amount: 180000, platformFee: 18000, payeeAmount: 162000, status: 'completed', paymentMethod: 'card', currency: 'NGN' },
    b5 && { transactionId: 'TXN20250005', booking: b5._id, payer: clients[1]._id, payee: providers[0]._id, amount: 250000, platformFee: 25000, payeeAmount: 225000, status: 'completed', paymentMethod: 'card', currency: 'NGN' },
    b6 && { transactionId: 'TXN20250006', booking: b6._id, payer: clients[2]._id, payee: providers[0]._id, amount: 180000, platformFee: 18000, payeeAmount: 162000, status: 'completed', paymentMethod: 'card', currency: 'NGN' },
  ].filter(Boolean);
  for (const pd of payDocs) {
    if (!(await Payment.findOne({ transactionId: pd.transactionId }))) {
      try {
        await Payment.collection.insertOne({ ...pd, refund: { status: 'none' }, createdAt: new Date(), updatedAt: new Date() });
        console.log('Payment:', pd.transactionId);
      } catch(e) { console.error('Payment err:', pd.transactionId, e.message); }
    }
  }

  // Platform settings
  const settingKeys = [
    { key: 'commissionRate', value: 10, description: 'Platform commission rate (%)' },
    { key: 'minCommission', value: 500, description: 'Minimum commission amount (NGN)' },
    { key: 'maxCommission', value: 50000, description: 'Maximum commission amount (NGN)' },
    { key: 'payoutSchedule', value: 'weekly', description: 'Provider payout schedule' },
  ];
  for (const s of settingKeys) {
    if (!(await PlatformSetting.findOne({ key: s.key }))) {
      await PlatformSetting.create(s);
      console.log('Setting:', s.key);
    }
  }

  // Coupons
  const coupons = [
    { code: 'WELCOME20', description: '20% off for new users', discountType: 'percentage', discountValue: 20, minOrderAmount: 50000, usageLimit: 100, startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'), isActive: true },
    { code: 'SAVE5000', description: 'N5000 off on orders above N100000', discountType: 'fixed', discountValue: 5000, minOrderAmount: 100000, usageLimit: 50, startDate: new Date('2025-01-01'), endDate: new Date('2025-06-30'), isActive: true },
    { code: 'EXPIRED10', description: 'Expired 10% coupon', discountType: 'percentage', discountValue: 10, startDate: new Date('2024-01-01'), endDate: new Date('2024-12-31'), isActive: false },
  ];
  for (const c of coupons) {
    if (!(await Coupon.findOne({ code: c.code }))) { await Coupon.create({ ...c, createdBy: admin._id }); console.log('Coupon:', c.code); }
  }

  // Promotions
  const promos = [
    { title: 'Valentine Special', description: 'Special discounts for Valentine events', type: 'discount_campaign', discountPercentage: 15, startDate: new Date('2025-02-01'), endDate: new Date('2025-02-28'), priority: 10, isActive: true },
    { title: 'Featured Vendors Banner', description: 'Showcase top vendors on homepage', type: 'banner', startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'), priority: 5, isActive: true },
    { title: 'Flash Sale Weekend', description: '24-hour flash sale on all services', type: 'flash_sale', discountPercentage: 25, startDate: new Date('2025-03-01'), endDate: new Date('2025-03-02'), priority: 20, isActive: false },
  ];
  for (const p of promos) {
    if (!(await Promotion.findOne({ title: p.title }))) { await Promotion.create({ ...p, createdBy: admin._id }); console.log('Promo:', p.title); }
  }

  // Notifications
  const notifs = [
    { title: 'Welcome to Event Compass!', message: 'Thank you for joining. Discover amazing event services near you.', type: 'broadcast', targetRole: 'all', channel: 'in_app', status: 'sent', sentAt: new Date() },
    { title: 'New Provider Verification', message: 'Your provider account has been verified. You can now receive bookings.', type: 'role_based', targetRole: 'service_provider', channel: 'email', status: 'sent', sentAt: new Date() },
    { title: 'Upcoming Maintenance', message: 'The platform will undergo maintenance on Sunday 2am-4am WAT.', type: 'broadcast', targetRole: 'all', channel: 'push', status: 'draft' },
  ];
  for (const n of notifs) {
    if (!(await Notification.findOne({ title: n.title }))) { await Notification.create({ ...n, createdBy: admin._id }); console.log('Notif:', n.title); }
  }

  // CMS Pages
  const pages = [
    { title: 'About Us', slug: 'about-us', type: 'page', status: 'published', content: 'Event Compass is Nigeria premier event rental and management marketplace.', excerpt: 'Learn about Event Compass', metaTitle: 'About Event Compass' },
    { title: 'Privacy Policy', slug: 'privacy-policy', type: 'policy', status: 'published', content: 'This Privacy Policy describes how Event Compass collects and uses your personal information.', excerpt: 'Our privacy policy' },
    { title: 'FAQ', slug: 'faq', type: 'faq', status: 'published', content: 'Q: How do I book?\nA: Browse services and click Book Now.', excerpt: 'Common questions' },
    { title: 'New Year Deals 2025', slug: 'new-year-deals-2025', type: 'blog', status: 'draft', content: 'Discover amazing deals for your 2025 events.', excerpt: 'Best event deals for 2025' },
  ];
  for (const p of pages) {
    if (!(await CMSPage.findOne({ slug: p.slug }))) { await CMSPage.create({ ...p, author: admin._id, publishedAt: p.status === 'published' ? new Date() : null }); console.log('CMS:', p.title); }
  }

  // Pending review (for moderation)
  if (!(await Review.findOne({ status: 'pending' })) && services.length > 0) {
    await Review.create({ reviewer: clients[0]._id, reviewedType: 'service', reviewedEntity: services[0]._id, rating: 2, review: 'This service was terrible and I want a refund immediately!!!', status: 'pending', isVisible: true });
    console.log('Pending review for moderation');
  }

  // Audit logs
  if ((await AuditLog.countDocuments()) < 5) {
    const entries = [
      { action: 'LOGIN', resource: 'User', status: 'success' },
      { action: 'UPDATE_COMMISSION', resource: 'PlatformSetting', status: 'success' },
      { action: 'BLOCK_USER', resource: 'User', status: 'success' },
      { action: 'CREATE_COUPON', resource: 'Coupon', status: 'success' },
      { action: 'MODERATE_REVIEW_REMOVE', resource: 'Review', status: 'success' },
    ];
    for (const e of entries) { await AuditLog.create({ ...e, actor: admin._id, actorRole: 'admin', ipAddress: '127.0.0.1' }); }
    console.log('Audit logs');
  }

  const counts = {
    users: await User.countDocuments(),
    services: await Service.countDocuments(),
    bookings: await Booking.countDocuments(),
    payments: await Payment.countDocuments(),
    categories: await Category.countDocuments(),
    coupons: await Coupon.countDocuments(),
    promotions: await Promotion.countDocuments(),
    notifications: await Notification.countDocuments(),
    cmsPages: await CMSPage.countDocuments(),
    reviews: await Review.countDocuments(),
    auditLogs: await AuditLog.countDocuments(),
  };

  console.log('\n✅ Seed complete!');
  console.log(JSON.stringify(counts, null, 2));
  console.log('\nLogin: admin@eventcompass.com / Admin@1234');
  process.exit(0);
};

run().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
