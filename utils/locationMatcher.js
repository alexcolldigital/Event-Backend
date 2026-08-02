const normalizeText = (value) => (value || '').toString().trim().toLowerCase();

const isBookingWithinCoverage = (serviceCoverage = {}, bookingLocation = {}) => {
  const serviceCountry = normalizeText(serviceCoverage.country);
  const bookingCountry = normalizeText(bookingLocation.country);

  if (serviceCountry && serviceCountry !== 'nigeria' && bookingCountry && bookingCountry !== serviceCountry) {
    return false;
  }

  if (bookingCountry && bookingCountry !== 'nigeria') {
    return false;
  }

  if (serviceCoverage.nationwide) {
    return true;
  }

  const serviceState = normalizeText(serviceCoverage.state);
  const bookingState = normalizeText(bookingLocation.state);
  if (serviceState && bookingState && serviceState !== bookingState) {
    return false;
  }

  const serviceCity = normalizeText(serviceCoverage.city);
  const bookingCity = normalizeText(bookingLocation.city);
  if (serviceCity && bookingCity && serviceCity !== bookingCity) {
    return false;
  }

  const serviceLga = normalizeText(serviceCoverage.lga);
  const bookingLga = normalizeText(bookingLocation.lga);
  if (serviceLga && bookingLga && serviceLga !== bookingLga) {
    return false;
  }

  return true;
};

module.exports = {
  isBookingWithinCoverage,
};
