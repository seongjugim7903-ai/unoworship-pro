// 연결된 디스플레이의 실제 좌표/크기/EDID(vendor·model·serial)를 한 줄씩 출력하는 헬퍼.
//   컴파일: clang -framework ApplicationServices -o scripts/displaylist scripts/displaylist.c
//   출력:   <x> <y> <w> <h> <vendor> <model> <serial> <main|ext>
#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>

int main(void) {
  CGDirectDisplayID ids[8];
  uint32_t n = 0;
  if (CGGetActiveDisplayList(8, ids, &n) != kCGErrorSuccess) return 1;
  for (uint32_t i = 0; i < n; i++) {
    CGRect b = CGDisplayBounds(ids[i]);
    printf("%d %d %d %d %u %u %u %s\n",
      (int)b.origin.x, (int)b.origin.y, (int)b.size.width, (int)b.size.height,
      CGDisplayVendorNumber(ids[i]), CGDisplayModelNumber(ids[i]),
      CGDisplaySerialNumber(ids[i]), CGDisplayIsMain(ids[i]) ? "main" : "ext");
  }
  return 0;
}
