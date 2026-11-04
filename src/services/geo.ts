import {AppError} from '../utils/AppError';
export function distanciaMetros(lat1:number,lon1:number,lat2:number,lon2:number):number{
 if(![lat1,lon1,lat2,lon2].every(Number.isFinite)||Math.abs(lat1)>90||Math.abs(lat2)>90||Math.abs(lon1)>180||Math.abs(lon2)>180)throw new AppError(422,'COORDENADAS_INVALIDAS','Coordenadas inválidas');
 const r=Math.PI/180,dlat=(lat2-lat1)*r,dlon=(lon2-lon1)*r;
 const a=Math.sin(dlat/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dlon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
export function validarRaio(lat:number,lon:number,refLat:number,refLon:number,raio:number){
 if(!Number.isFinite(raio)||raio<=0)throw new AppError(422,'RAIO_NAO_CONFIGURADO','Raio operacional inválido');
 const distancia=distanciaMetros(lat,lon,refLat,refLon);
 if(distancia>raio)throw new AppError(422,'FORA_DA_AREA_OPERACIONAL',`Distância ${Math.round(distancia)}m supera o raio permitido de ${raio}m`);
 return Math.round(distancia*1000)/1000;
}
