const buildCartCheckoutPayloads = ({ userId, bookingDetails = {}, cartItems = [] }) => {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Cart is empty');
  }

  return cartItems.map((item) => ({
    client: userId,
    serviceId: item.serviceId,
    venueId: item.venueId,
    eventDate: bookingDetails.eventDate,
    eventEndDate: bookingDetails.eventEndDate,
    eventTime: bookingDetails.eventTime,
    duration: bookingDetails.duration,
    numberOfGuests: item.quantity || bookingDetails.numberOfGuests || 1,
    specialRequirements: item.specialRequirements || bookingDetails.specialRequirements || '',
    clientNotes: bookingDetails.clientNotes || '',
    bookingLocation: bookingDetails.bookingLocation || {},
  }));
};

module.exports = {
  buildCartCheckoutPayloads,
};
