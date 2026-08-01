/** Distancia en metros entre dos coordenadas (formula haversine). Extraido de
 * anda-gana.component.ts para poder probarlo sin instanciar el componente completo -- esta
 * cuenta es la que decide, entre otras cosas, cuando finalizar un viaje automaticamente por GPS
 * (_checkAutoFinishTrip), asi que un error aca finaliza viajes de mas o de menos. */
export function distMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
