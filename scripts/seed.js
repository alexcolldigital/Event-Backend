/**
 * Seed script - populates MongoDB with demo data for all admin screens
 * Run: node scripts/seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

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

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // ── Admin ──────────────────────────────────────────────────────────────────
  let admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    admin = await User.create({
      firstName: 'Event', lastName: 'Admin',
      email: 'admin@eventcompass.com', phoneNumber: '+2340000000000',
      password: 'Admin@1234', role: 'admin',
      isEmailVerified: true,
    });
    console.log('Admin created:', admin.email);
  } else {
    console.log('Admin exists:', admin.email);
  }

  // ── Providers ──────────────────────────────────────────────────────────────
  const providerData = [
    { firstName: 'Ada', lastName: 'Nnamdi', email: 'provider@eventcompass.com', phoneNumber: '+2348012345678', businessName: 'Ada Event Planning', businessType: 'event_planner', businessDescription: 'Premium event planning and vendor coordination.', isBusinessVerified: true },
    { firstName: 'Emeka', lastName: 'Obi', email: 'emeka@eventcompass.com', phoneNumber: '+2348023456789', businessName: 'Emeka Photography', businessType: 'events_service_provider', businessDescription: 'Professional event photography.', isBusinessVerified: true },
    { firstName: 'Ngozi', lastName: 'Eze', email: 'ngozi@eventcompass.com', phoneNumber: '+2348034567890', businessName: 'Ngozi Catering', businessType: 'food_caterer', businessDescription: 'Authentic Nigerian cuisine for events.', isBusinessVerified: false },
  ];

  const providers = [];
  for (const pd of providerData) {
    let p = await User.findOne({ email: pd.email });
    if (!p) {
      p = await User.create({ ...pd, password: 'Demo12345', role: 'service_provider', isEmailVerified: true });
      console.log('Provider created:', p.email);
    }
    providers.push(p);
  }

  // ── Clients ────────────────────────────────────────────────────────────────
  const clientData = [
    { firstName: 'Chidi', lastName: 'Okafor', email: 'client@eventcompass.com', phoneNumber: '+2348098765432' },
    { firstName: 'Amaka', lastName: 'Ibe', email: 'amaka@eventcompass.com', phoneNumber: '+2348087654321' },
    { firstName: 'Tunde', lastName: 'Adeyemi', email: 'tunde@eventcompass.com', phoneNumber: '+2348076543210' },
  ];

  const clients = [];
  for (const cd of clientData) {
    let c = await User.findOne({ email: cd.email });
    if (!c) {
      c = await User.create({ ...cd, password: 'Demo12345', role: 'client', isEmailVerified: true });
      console.log('Client created:', c.email);
    }
    clients.push(c);
  }

  // ── Categories ─────────────────────────────────────────────────────────────
  const parentCatData = [
    { name: 'Canopies and Tent',                             icon: 'tent',                  sortOrder: 0 },
    { name: 'Chairs',                                        icon: 'seat',                  sortOrder: 1 },
    { name: 'Tables',                                        icon: 'table-furniture',       sortOrder: 2 },
    { name: 'Event Planners and Managers',                   icon: 'clipboard-list',        sortOrder: 3 },
    { name: 'Events Services Providers and Vendors',         icon: 'store',                 sortOrder: 4 },
    { name: 'Events Facilitators and Agents',                icon: 'handshake',             sortOrder: 5 },
    { name: 'Special Events Hosts and Organizers',           icon: 'account-star',          sortOrder: 6 },
    { name: 'Events Venues',                                 icon: 'home-city',             sortOrder: 7 },
    { name: 'Event Decorators',                              icon: 'palette',               sortOrder: 8 },
    { name: 'Make-up Artists',                               icon: 'face-woman-shimmer',    sortOrder: 9 },
    { name: 'Ushers',                                        icon: 'account-tie',           sortOrder: 10 },
    { name: 'Bouncers',                                      icon: 'shield-account',        sortOrder: 11 },
    { name: 'Events Facilities Rental and Hiring Companies', icon: 'warehouse',             sortOrder: 12 },
    { name: 'Ice Chilling Services',                         icon: 'snowflake',             sortOrder: 13 },
    { name: 'Refrigerated Vans/Cooling Vans Providers',      icon: 'truck-snowflake',       sortOrder: 14 },
    { name: 'Food Caterers',                                 icon: 'silverware-fork-knife', sortOrder: 15 },
    { name: 'Drinks Suppliers',                              icon: 'bottle-wine',           sortOrder: 16 },
    { name: 'Music (D-J and Live Performances)',             icon: 'music',                 sortOrder: 17 },
    { name: 'MCs and Compares',                              icon: 'microphone',            sortOrder: 18 },
    { name: 'Comedians and Entertainers',                    icon: 'emoticon-happy',        sortOrder: 19 },
  ];

  const subCatData = [
    { parent: 'Canopies and Tent', subs: ['12 by 12 Canopy', '12 by 24 Canopy', '20 by 40 Tent', '30 by 60 Tent', '40 by 80 Tent'] },
    { parent: 'Chairs',           subs: ['Plastic Chair', 'Chivalry Chair', 'Bridal Chair'] },
    { parent: 'Tables',           subs: ['Plastic Table', 'Banquet Table'] },
  ];

  const parentDocs = {};
  for (const cd of parentCatData) {
    let cat = await Category.findOne({ name: cd.name });
    if (!cat) {
      cat = await Category.create({ ...cd, slug: cd.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: cd.name + ' services for events', isActive: true });
      console.log('Category created:', cd.name);
    }
    parentDocs[cd.name] = cat;
  }

  for (const sc of subCatData) {
    const parent = parentDocs[sc.parent];
    if (!parent) continue;
    for (let i = 0; i < sc.subs.length; i++) {
      const subName = sc.subs[i];
      const exists = await Category.findOne({ name: subName, parentCategory: parent._id });
      if (!exists) {
        await Category.create({
          name: subName,
          slug: subName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          description: subName,
          icon: parent.icon,
          parentCategory: parent._id,
          isActive: true,
          sortOrder: i,
        });
        console.log('Subcategory created:', subName);
      }
    }
  }

  // ── Services ───────────────────────────────────────────────────────────────
  const serviceData = [
    { name: 'Premium Event Planning Package', description: 'Full-service event planning with vendor coordination, timeline management, and day-of execution.', provider: providers[0]._id, providerType: 'event_planner', serviceType: 'Event Planning', category: 'Event Planners and Managers', pricing: { basePrice: 250000, unit: 'fixed', currency: 'NGN' }, isFeatured: true, isActive: true, tags: ['wedding', 'corporate', 'planning'] },
    { name: 'Corporate Event Management', description: 'End-to-end corporate event management including venue sourcing, logistics, and on-site coordination.', provider: providers[0]._id, providerType: 'event_planner', serviceType: 'Event Planning', category: 'Event Planners and Managers', pricing: { basePrice: 300000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['corporate', 'planning', 'management'] },
    { name: 'Elegant Venue Decoration', description: 'Modern floral styling, table setting, stage backdrop, and ambient decor for premium events.', provider: providers[0]._id, providerType: 'event_planner', serviceType: 'Decor', category: 'Event Decorators', pricing: { basePrice: 180000, unit: 'fixed', currency: 'NGN' }, isFeatured: true, isActive: true, tags: ['decor', 'wedding', 'styling'] },
    { name: 'Floral & Balloon Decoration', description: 'Creative floral arrangements and balloon art for weddings, birthdays, and corporate events.', provider: providers[0]._id, providerType: 'event_planner', serviceType: 'Decor', category: 'Event Decorators', pricing: { basePrice: 95000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['decor', 'floral', 'balloon'] },
    { name: 'Professional Event Photography', description: 'High-quality event photography with same-day preview and full gallery delivery within 7 days.', provider: providers[1]._id, providerType: 'events_service_provider', serviceType: 'Photography', category: 'Events Services Providers and Vendors', pricing: { basePrice: 120000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['photography', 'wedding', 'corporate'] },
    { name: 'Event Videography Package', description: 'Cinematic event videography with drone shots, highlight reel, and full-length video.', provider: providers[1]._id, providerType: 'events_service_provider', serviceType: 'Videography', category: 'Events Services Providers and Vendors', pricing: { basePrice: 150000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['videography', 'wedding', 'corporate'] },
    { name: 'Authentic Nigerian Catering', description: 'Full catering service with authentic Nigerian cuisine, serving up to 500 guests.', provider: providers[2]._id, providerType: 'food_caterer', serviceType: 'Catering', category: 'Food Caterers', pricing: { basePrice: 350000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['catering', 'food', 'wedding'] },
    { name: 'Continental Buffet Service', description: 'Premium continental buffet catering for corporate events and weddings, up to 300 guests.', provider: providers[2]._id, providerType: 'food_caterer', serviceType: 'Catering', category: 'Food Caterers', pricing: { basePrice: 280000, unit: 'fixed', currency: 'NGN' }, isFeatured: true, isActive: true, tags: ['catering', 'buffet', 'continental'] },
    { name: 'Live Band Entertainment', description: 'Professional live band for weddings, corporate events, and parties.', provider: providers[0]._id, providerType: 'music_dj_and_live_performance', serviceType: 'Live Band', category: 'Music (D-J and Live Performances)', pricing: { basePrice: 200000, unit: 'fixed', currency: 'NGN' }, isFeatured: true, isActive: true, tags: ['music', 'band', 'entertainment'] },
    { name: 'DJ Services & Sound System', description: 'Professional DJ with state-of-the-art sound system and lighting for any event.', provider: providers[1]._id, providerType: 'music_dj_and_live_performance', serviceType: 'DJ', category: 'Music (D-J and Live Performances)', pricing: { basePrice: 80000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['dj', 'music', 'sound'] },
    { name: 'Premium Event Venue - Victoria Island', description: 'Elegant event hall with capacity for 500 guests, full AV setup, and dedicated parking.', provider: providers[0]._id, providerType: 'events_venue_owner_and_manager', serviceType: 'Venue', category: 'Events Venues', pricing: { basePrice: 500000, unit: 'fixed', currency: 'NGN' }, isFeatured: true, isActive: true, tags: ['venue', 'hall', 'wedding'] },
    { name: 'Outdoor Garden Venue', description: 'Beautiful outdoor garden venue for intimate events, capacity 150 guests.', provider: providers[1]._id, providerType: 'events_venue_owner_and_manager', serviceType: 'Venue', category: 'Events Venues', pricing: { basePrice: 200000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['venue', 'outdoor', 'garden'] },
    { name: 'Bridal Makeup & Glam', description: 'Professional bridal makeup, hair styling, and full glam for the bride and bridal party.', provider: providers[2]._id, providerType: 'makeup_artist', serviceType: 'Makeup', category: 'Make-up Artists', pricing: { basePrice: 75000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['makeup', 'bridal', 'glam'] },
    { name: 'Event Makeup for Guests', description: 'On-site makeup services for event guests and attendees.', provider: providers[2]._id, providerType: 'makeup_artist', serviceType: 'Makeup', category: 'Make-up Artists', pricing: { basePrice: 15000, unit: 'per_person', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['makeup', 'event', 'guests'] },
    { name: '40x80 Canopy Tent Rental', description: 'Large 40x80 canopy tent rental with setup and takedown, suitable for 300+ guests.', provider: providers[1]._id, providerType: 'events_facilities_rental_and_hiring_company', serviceType: 'Canopy Rental', category: 'Canopies and Tent', pricing: { basePrice: 120000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['canopy', 'tent', 'rental'] },
    { name: 'Chivalry Chair Rental (100 units)', description: 'Premium chivalry chair rental for weddings and formal events, 100-unit package.', provider: providers[1]._id, providerType: 'events_facilities_rental_and_hiring_company', serviceType: 'Chair Rental', category: 'Chairs', pricing: { basePrice: 50000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['chairs', 'rental', 'wedding'] },
    { name: 'Banquet Table Rental (20 units)', description: 'Banquet table rental with linen covers, 20-unit package for events.', provider: providers[1]._id, providerType: 'events_facilities_rental_and_hiring_company', serviceType: 'Table Rental', category: 'Tables', pricing: { basePrice: 30000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['tables', 'rental', 'banquet'] },
    { name: 'Drinks & Beverages Supply', description: 'Full drinks supply including soft drinks, water, and alcoholic beverages for events.', provider: providers[2]._id, providerType: 'drinks_supplier', serviceType: 'Drinks Supply', category: 'Drinks Suppliers', pricing: { basePrice: 150000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['drinks', 'beverages', 'supply'] },
    { name: 'Professional MC Services', description: 'Experienced MC for weddings, corporate events, and parties with bilingual capability.', provider: providers[0]._id, providerType: 'mc_and_compares', serviceType: 'MC', category: 'MCs and Compares', pricing: { basePrice: 60000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['mc', 'host', 'wedding'] },
    { name: 'Stand-up Comedy & Entertainment', description: 'Professional comedian and entertainer for events, corporate shows, and parties.', provider: providers[1]._id, providerType: 'comedian_and_entertainer', serviceType: 'Comedy', category: 'Comedians and Entertainers', pricing: { basePrice: 100000, unit: 'fixed', currency: 'NGN' }, isFeatured: false, isActive: true, tags: ['comedy', 'entertainment', 'events'] },
  ];

  const services = [];
  for (const sd of serviceData) {
    let s = await Service.findOneAndUpdate(
      { name: sd.name },
      { $set: { ...sd, availability: { isAvailable: true } } },
      { upsert: true, new: true }
    );
    if (!s) s = await Service.findOne({ name: sd.name });
    console.log('Service upserted:', s.name);
    services.push(s);
  }

  // ── Bookings + Payments ────────────────────────────────────────────────────
  const bookingScenarios = [
    { client: clients[0], service: services[0], provider: providers[0], status: 'completed', payStatus: 'completed', amount: 250000, daysFromNow: -7 },
    { client: clients[1], service: services[2], provider: providers[0], status: 'confirmed', payStatus: 'completed', amount: 180000, daysFromNow: 3 },
    { client: clients[2], service: services[4], provider: providers[1], status: 'pending', payStatus: 'pending', amount: 120000, daysFromNow: 14 },
    { client: clients[0], service: services[6], provider: providers[2], status: 'cancelled', payStatus: 'refunded', amount: 350000, daysFromNow: -14 },
    { client: clients[1], service: services[0], provider: providers[0], status: 'completed', payStatus: 'completed', amount: 250000, daysFromNow: -30 },
    { client: clients[2], service: services[2], provider: providers[0], status: 'confirmed', payStatus: 'completed', amount: 180000, daysFromNow: 7 },
  ];

  for (let i = 0; i < bookingScenarios.length; i++) {
    const sc = bookingScenarios[i];
    const bn = `BK2025${String(i + 1).padStart(4, '0')}`;
    const exists = await Booking.findOne({ bookingNumber: bn });
    if (!exists) {
      const booking = await Booking.create({
        bookingNumber: bn,
        bookingType: 'service',
        client: sc.client._id,
        serviceProvider: sc.provider._id,
        service: sc.service._id,
        status: sc.status,
        eventDate: new Date(Date.now() + sc.daysFromNow * 24 * 60 * 60 * 1000),
        numberOfGuests: 50 + i * 20,
        pricing: { basePrice: sc.amount, totalAmount: sc.amount },
        totalAmount: sc.amount,
        paymentStatus: sc.payStatus,
        ...(sc.status === 'completed' ? { completedDate: new Date() } : {}),
        ...(sc.status === 'confirmed' ? { confirmedDate: new Date() } : {}),
        ...(sc.status === 'cancelled' ? { cancelledDate: new Date(), cancellationReason: 'Client request' } : {}),
      });

      if (['completed', 'confirmed'].includes(sc.status)) {
        await Payment.create({
          transactionId: `TXN2025${String(i + 1).padStart(4, '0')}`,
          booking: booking._id,
          payer: sc.client._id,
          payee: sc.provider._id,
          amount: sc.amount,
          platformFee: Math.round(sc.amount * 0.1),
          payeeAmount: Math.round(sc.amount * 0.9),
          status: sc.payStatus === 'refunded' ? 'refunded' : 'completed',
          paymentMethod: 'card',
          ...(sc.payStatus === 'refunded' ? { refund: { status: 'pending', amount: sc.amount, reason: 'Event cancelled', requestedAt: new Date() } } : {}),
        });
      }
      console.log('Booking created:', bn, sc.status);
    }
  }

  // ── Platform Settings ──────────────────────────────────────────────────────
  const defaultPlatformSettings = [
    { key: 'commissionRate', value: 10, description: 'Platform commission rate (%)' },
    { key: 'minCommission', value: 500, description: 'Minimum commission amount (₦)' },
    { key: 'maxCommission', value: 50000, description: 'Maximum commission amount (₦)' },
    { key: 'payoutSchedule', value: 'weekly', description: 'Provider payout schedule' },
    { key: 'serviceFeePercentage', value: 10, description: 'Service & delivery fee charged to clients (%)' },
  ];
  for (const s of defaultPlatformSettings) {
    await PlatformSetting.findOneAndUpdate({ key: s.key }, s, { upsert: true, new: true });
  }
  console.log('Platform settings seeded');

  // ── Coupons ────────────────────────────────────────────────────────────────
  const couponData = [
    { code: 'WELCOME20', description: '20% off for new users', discountType: 'percentage', discountValue: 20, minOrderAmount: 50000, usageLimit: 100, startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'), isActive: true },
    { code: 'SAVE5000', description: '₦5,000 off on orders above ₦100,000', discountType: 'fixed', discountValue: 5000, minOrderAmount: 100000, usageLimit: 50, startDate: new Date('2025-01-01'), endDate: new Date('2025-06-30'), isActive: true },
    { code: 'EXPIRED10', description: 'Expired 10% coupon', discountType: 'percentage', discountValue: 10, startDate: new Date('2024-01-01'), endDate: new Date('2024-12-31'), isActive: false },
  ];

  for (const cd of couponData) {
    const exists = await Coupon.findOne({ code: cd.code });
    if (!exists) {
      await Coupon.create({ ...cd, createdBy: admin._id });
      console.log('Coupon created:', cd.code);
    }
  }

  // ── Promotions ─────────────────────────────────────────────────────────────
  const promoData = [
    { title: 'Valentine Special', description: 'Special discounts for Valentine events', type: 'discount_campaign', discountPercentage: 15, startDate: new Date('2025-02-01'), endDate: new Date('2025-02-28'), priority: 10, isActive: true },
    { title: 'Featured Vendors Banner', description: 'Showcase top vendors on homepage', type: 'banner', startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'), priority: 5, isActive: true },
    { title: 'Flash Sale Weekend', description: '24-hour flash sale on all services', type: 'flash_sale', discountPercentage: 25, startDate: new Date('2025-03-01'), endDate: new Date('2025-03-02'), priority: 20, isActive: false },
  ];

  for (const pd of promoData) {
    const exists = await Promotion.findOne({ title: pd.title });
    if (!exists) {
      await Promotion.create({ ...pd, createdBy: admin._id });
      console.log('Promotion created:', pd.title);
    }
  }

  // ── Notifications ──────────────────────────────────────────────────────────
  const notifData = [
    { title: 'Welcome to Event Compass!', message: 'Thank you for joining Event Compass. Discover amazing event services near you.', type: 'broadcast', targetRole: 'all', channel: 'in_app', status: 'sent', sentAt: new Date() },
    { title: 'New Provider Verification', message: 'Your provider account has been verified. You can now receive bookings.', type: 'role_based', targetRole: 'service_provider', channel: 'email', status: 'sent', sentAt: new Date() },
    { title: 'Upcoming Maintenance', message: 'The platform will undergo maintenance on Sunday 2am-4am WAT.', type: 'broadcast', targetRole: 'all', channel: 'push', status: 'draft' },
  ];

  for (const nd of notifData) {
    const exists = await Notification.findOne({ title: nd.title });
    if (!exists) {
      await Notification.create({ ...nd, createdBy: admin._id });
      console.log('Notification created:', nd.title);
    }
  }

  // ── CMS Pages ──────────────────────────────────────────────────────────────
  const cmsData = [
    { title: 'About Us', slug: 'about-us', type: 'page', status: 'published', content: 'Event Compass is Nigeria\'s premier event rental and management marketplace connecting clients with top service providers.', excerpt: 'Learn about Event Compass', metaTitle: 'About Event Compass', metaDescription: 'Nigeria\'s premier event marketplace' },
    { title: 'Privacy Policy', slug: 'privacy-policy', type: 'policy', status: 'published', content: 'This Privacy Policy describes how Event Compass collects, uses, and shares your personal information.', excerpt: 'Our privacy policy', metaTitle: 'Privacy Policy - Event Compass' },
    { title: 'Frequently Asked Questions', slug: 'faq', type: 'faq', status: 'published', content: 'Q: How do I book a service?\nA: Browse services, select one, and click Book Now.\n\nQ: How do I pay?\nA: We accept card payments via Paystack.', excerpt: 'Common questions answered' },
    { title: 'New Year Deals 2025', slug: 'new-year-deals-2025', type: 'blog', status: 'draft', content: 'Discover amazing deals for your 2025 events. From weddings to corporate events, we have you covered.', excerpt: 'Best event deals for 2025' },
  ];

  for (const cd of cmsData) {
    const exists = await CMSPage.findOne({ slug: cd.slug });
    if (!exists) {
      await CMSPage.create({ ...cd, author: admin._id, publishedAt: cd.status === 'published' ? new Date() : null });
      console.log('CMS page created:', cd.title);
    }
  }

  // ── Reviews (flagged for moderation) ──────────────────────────────────────
  const reviewExists = await Review.findOne({ status: 'flagged' });
  if (!reviewExists && services.length > 0) {
    await Review.create({
      reviewer: clients[0]._id,
      reviewedType: 'service',
      reviewedEntity: services[0]._id,
      rating: 2,
      review: 'This service was terrible and I want a refund immediately!!!',
      status: 'pending',
      isVisible: true,
    });
    console.log('Flagged review created');
  }

  // ── Audit Logs ─────────────────────────────────────────────────────────────
  const auditCount = await AuditLog.countDocuments();
  if (auditCount < 5) {
    const auditEntries = [
      { action: 'LOGIN', resource: 'User', actorRole: 'admin', status: 'success' },
      { action: 'UPDATE_COMMISSION', resource: 'PlatformSetting', actorRole: 'admin', status: 'success' },
      { action: 'BLOCK_USER', resource: 'User', actorRole: 'admin', status: 'success' },
      { action: 'CREATE_COUPON', resource: 'Coupon', actorRole: 'admin', status: 'success' },
      { action: 'MODERATE_REVIEW_REMOVE', resource: 'Review', actorRole: 'admin', status: 'success' },
    ];
    for (const entry of auditEntries) {
      await AuditLog.create({ ...entry, actor: admin._id, ipAddress: '127.0.0.1' });
    }
    console.log('Audit logs created');
  }

  // ── Final count ────────────────────────────────────────────────────────────
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
  console.log('\n🔑 Login credentials:');
  console.log('   Admin:    admin@eventcompass.com / Admin@1234');
  console.log('   Provider: provider@eventcompass.com / Demo12345');
  console.log('   Client:   client@eventcompass.com / Demo12345');

  process.exit(0);
};

run().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
