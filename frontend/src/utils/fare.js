export function calculateFare(distanceKm, pricePerKm, platformFee = 1) {
  const parsedDistance = parseFloat(distanceKm || 0);
  const parsedRate = parseFloat(pricePerKm || 0);
  const parsedPlatformFee = parseFloat(platformFee || 0);

  if (parsedDistance <= 0 || parsedRate <= 0) {
    return {
      baseFare: 0,
      platformFee: parsedPlatformFee,
      totalFare: 0,
    };
  }

  const baseFare = parseFloat((parsedDistance * parsedRate).toFixed(2));
  const totalFare = parseFloat((baseFare + parsedPlatformFee).toFixed(2));

  return {
    baseFare,
    platformFee: parsedPlatformFee,
    totalFare,
  };
}
