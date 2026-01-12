const keyOf = (listingId: string) => `mp_fav_${listingId}`;

export function getFavLocal(listingId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(keyOf(listingId)) === "1";
}

export function setFavLocal(listingId: string, val: boolean) {
  localStorage.setItem(keyOf(listingId), val ? "1" : "0");
}
