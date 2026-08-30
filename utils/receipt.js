const formatPartyName = (party) => {
  if (!party) return '';
  return party.businessName || [party.firstName, party.lastName].filter(Boolean).join(' ').trim() || String(party);
};

const toId = (value) => {
  if (!value) return undefined;
  return String(value._id || value);
};

const toNumber = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildLineItems = (booking) => {
  if (Array.isArray(booking.adminSetPrices) && booking.adminSetPrices.length > 0) {
    return booking.adminSetPrices.map((item) => ({
      serviceId: toId(item.serviceId),
      name: item.serviceName || 'Service',
      quantity: 1,
      unitPrice: toNumber(item.price),
      amount: toNumber(item.price),
    }));
  }

  const service = booking.service;
  const venue = booking.venue;
  const selected = service || venue || {};
  const pricing = booking.pricing || {};
  const quantity = toNumber(pricing.quantity || booking.numberOfGuests || booking.duration || 1) || 1;
  const unitPrice = toNumber(pricing.unitPrice || pricing.basePrice || selected?.pricing?.basePrice || selected?.rentalPrice?.daily);
  const amount = toNumber(pricing.subtotal || unitPrice * quantity);

  return [{
    serviceId: toId(service || venue),
    name: selected.name || (service ? 'Service' : 'Venue'),
    category: selected.category || selected.subCategory || booking.bookingType,
    quantity,
    unitPrice,
    amount,
  }];
};

const buildBookingReceipt = (booking, payment = {}) => {
  const pricing = booking.pricing || {};
  const paymentType = payment.paymentType || 'booking';
  const amountPaid = toNumber(payment.amountPaid);

  return {
    receiptNumber: paymentType === 'booking'
      ? `RCPT-${booking.bookingNumber}`
      : `RCPT-${booking.bookingNumber}-${String(paymentType).toUpperCase()}`,
    bookingNumber: booking.bookingNumber,
    bookingId: toId(booking),
    generatedAt: new Date(),
    status: payment.status || booking.payment?.status || 'pending',
    eventDetails: {
      eventDate: booking.eventDate,
      eventEndDate: booking.eventEndDate,
      eventTime: booking.eventTime,
      duration: booking.duration,
      numberOfGuests: booking.numberOfGuests,
      specialRequirements: booking.specialRequirements || '',
      clientNotes: booking.clientNotes || '',
      bookingLocation: booking.bookingLocation || {},
    },
    parties: {
      clientId: toId(booking.client),
      clientName: formatPartyName(booking.client),
      providerId: toId(booking.serviceProvider),
      providerName: formatPartyName(booking.serviceProvider),
    },
    items: buildLineItems(booking),
    amounts: {
      subtotal: toNumber(pricing.subtotal),
      serviceAndDeliveryFee: toNumber(pricing.serviceAndDeliveryFee),
      discount: toNumber(pricing.discount),
      tax: toNumber(pricing.tax),
      totalAmount: toNumber(pricing.totalAmount),
      currency: pricing.currency || 'NGN',
      amountPaid,
      balanceDue: Math.max(0, toNumber(pricing.totalAmount) - amountPaid),
    },
    payment: {
      paymentType,
      paymentPlan: booking.paymentPlan,
      depositAmount: toNumber(booking.depositAmount),
      balanceDue: toNumber(booking.balanceDue),
      method: payment.method || booking.payment?.method,
      transactionId: payment.transactionId || booking.payment?.transactionId,
      paymentDate: payment.paymentDate || booking.payment?.paymentDate,
    },
  };
};

module.exports = {
  buildBookingReceipt,
};
