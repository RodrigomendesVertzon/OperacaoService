import {describe,it,expect} from 'vitest';
import {distanciaMetros,validarRaio} from '../src/services/geo';
describe('geolocalização',()=>{
 it('distância zero no mesmo ponto',()=>expect(distanciaMetros(-23.5226,-46.835,-23.5226,-46.835)).toBe(0));
 it('aceita dentro do raio',()=>expect(validarRaio(-23.5226,-46.835,-23.5226,-46.835,50)).toBe(0));
 it('rejeita distância excessiva',()=>expect(()=>validarRaio(-23.53,-46.835,-23.5226,-46.835,50)).toThrow('supera o raio'));
 it('rejeita coordenadas inválidas',()=>expect(()=>distanciaMetros(100,0,0,0)).toThrow('Coordenadas inválidas'));
});
