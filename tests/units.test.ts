import { describe, expect, it } from "vitest";
import { hamdanMetne, metindenHama } from "../packages/chain/src/units.js";

describe("tutar dönüşümü", () => {
  it("ham tam sayıyı ondalığa çevirir", () => {
    expect(hamdanMetne("1000000", 6)).toBe("1");
    expect(hamdanMetne("1234567", 6)).toBe("1.234567");
    expect(hamdanMetne("100", 6)).toBe("0.0001");
    expect(hamdanMetne("0", 6)).toBe("0");
  });

  it("sondaki sıfırları kırpar ama değeri değiştirmez", () => {
    expect(hamdanMetne("1500000", 6)).toBe("1.5");
    expect(hamdanMetne("1000000000000000000", 18)).toBe("1");
  });

  it("float'ın kaldıramayacağı büyüklükte tutarı bozmaz", () => {
    // 2^63'ün üstünde: Number ile geçilseydi son basamaklar kayardı.
    const buyuk = "123456789012345678901234567890";
    expect(hamdanMetne(buyuk, 18)).toBe("123456789012.34567890123456789");
  });

  it("metinden hama çevirirken fazla basamağı KESER, yuvarlamaz", () => {
    // Yuvarlama bir adli raporda kaynakta olmayan bir tutar üretir.
    expect(metindenHama("1.2345678", 6)).toBe("1234567");
    expect(metindenHama("1.5", 6)).toBe("1500000");
    expect(metindenHama("0.000001", 6)).toBe("1");
  });

  it("zincirde gerçekten görülen uç değeri bozmadan gösterir", () => {
    // 2^256-1: dolandırıcı token'ların "sonsuz" değeri, canlı veride görüldü.
    // Number'a çevrilseydi 1.1579208923731618e+53 olur ve rapora öyle düşerdi.
    const ucDeger = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    expect(hamdanMetne(ucDeger, 6)).toBe(
      "115792089237316195423570985008687907853269984665640564039457584007913129.639935",
    );
  });

  it("gidiş-dönüş değeri korur", () => {
    for (const ham of ["1", "999", "1000000", "123456789012345678"]) {
      expect(metindenHama(hamdanMetne(ham, 6), 6)).toBe(ham);
    }
  });
});
