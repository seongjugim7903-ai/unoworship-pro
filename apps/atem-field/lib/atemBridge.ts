/**
 * atemBridge.ts
 * ATEM 스위처 연동 모듈
 *
 * 기능:
 *  - ATEM 이더넷 TCP/UDP 연결 관리 (atem-connection 라이브러리)
 *  - 자막 PNG 이미지를 ATEM 미디어 풀에 업로드
 *  - Downstream Keyer(DSK) on/off 제어
 *  - UnoLive 섹션 전환 시 자막 자동 반영
 *
 * 사용 방법:
 *  const bridge = AtemBridge.getInstance();
 *  await bridge.connect('192.168.0.100');
 *  await bridge.sendSubtitle(pngBuffer, '가사 텍스트');
 *  await bridge.clearSubtitle();
 */

import { Atem } from 'atem-connection';

// ─── 설정 타입 ───────────────────────────────────────────────────────────────

export interface AtemBridgeConfig {
  /** ATEM 스위처 IP 주소 (예: '192.168.0.100') */
  ip: string;
  /** 자막에 사용할 미디어 풀 슬롯 번호 (0-based, 기본값: 0) */
  mediaSlot: number;
  /** 자막을 표시할 DSK 번호 (0-based, 기본값: 0) */
  dskIndex: number;
  /** DSK 전환 속도 (프레임, 기본값: 3) */
  dskRate: number;
  /**
   * DSK Fill Source 입력 번호
   * ATEM Mini Pro ISO 기준:
   *   MediaPlayer 1 Fill = 3010
   *   MediaPlayer 2 Fill = 3020
   */
  mediaPlayerFillSource: number;
  /**
   * DSK Key Source 입력 번호
   * ATEM Mini Pro ISO 기준:
   *   MediaPlayer 1 Key  = 3011
   *   MediaPlayer 2 Key  = 3021
   */
  mediaPlayerKeySource: number;
}

export const DEFAULT_ATEM_CONFIG: AtemBridgeConfig = {
  ip: '192.168.0.100',
  mediaSlot: 0,
  dskIndex: 0,
  dskRate: 3,
  mediaPlayerFillSource: 3010, // MediaPlayer 1 Fill
  mediaPlayerKeySource: 3011,  // MediaPlayer 1 Key
};

// ─── 연결 상태 ───────────────────────────────────────────────────────────────

export type AtemConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface AtemBridgeStatus {
  state: AtemConnectionState;
  ip: string;
  error?: string;
  /** 마지막으로 전송된 자막 텍스트 */
  lastSubtitle?: string;
  /** DSK 현재 on/off 상태 */
  dskOnAir: boolean;
  /** ME1 프로그램 입력 번호 (카메라 전환 탈리용) */
  programInput?: number;
}

// ─── 싱글턴 브릿지 클래스 ────────────────────────────────────────────────────

class AtemBridgeClass {
  private static _instance: AtemBridgeClass | null = null;

  private atem: Atem | null = null;
  private config: AtemBridgeConfig = { ...DEFAULT_ATEM_CONFIG };
  private _status: AtemBridgeStatus = {
    state: 'disconnected',
    ip: '',
    dskOnAir: false,
  };

  /** 상태 변경 콜백 (UI 업데이트용) */
  public onStatusChange?: (status: AtemBridgeStatus) => void;

  private constructor() {}

  static getInstance(): AtemBridgeClass {
    // tsx(커스텀 서버)와 Next 번들(API 라우트)이 이 모듈을 각자 로드하므로,
    // 프로세스 전역(globalThis)으로 싱글턴을 공유해야 양쪽이 같은 연결을 본다.
    const g = globalThis as typeof globalThis & { __unoliveAtemBridge?: AtemBridgeClass };
    if (!g.__unoliveAtemBridge) {
      g.__unoliveAtemBridge = AtemBridgeClass._instance ?? new AtemBridgeClass();
    }
    AtemBridgeClass._instance = g.__unoliveAtemBridge;
    return g.__unoliveAtemBridge;
  }

  // ─── 상태 조회 ─────────────────────────────────────────────────────────────

  get status(): Readonly<AtemBridgeStatus> {
    return this._status;
  }

  get isConnected(): boolean {
    return this._status.state === 'connected';
  }

  // ─── 연결 관리 ─────────────────────────────────────────────────────────────

  async connect(ip: string, config?: Partial<AtemBridgeConfig>): Promise<void> {
    // 기존 연결 정리
    if (this.atem) {
      await this.disconnect();
    }

    this.config = { ...DEFAULT_ATEM_CONFIG, ...config, ip };
    this._setStatus({ state: 'connecting', ip, dskOnAir: false });

    return new Promise((resolve, reject) => {
      const atem = new Atem();
      this.atem = atem;

      const timeout = setTimeout(() => {
        this._setStatus({
          state: 'error',
          ip,
          dskOnAir: false,
          error: `연결 타임아웃 (${ip})`,
        });
        reject(new Error(`ATEM 연결 타임아웃: ${ip}`));
      }, 10000);

      atem.on('error', (err) => {
        clearTimeout(timeout);
        this._setStatus({
          state: 'error',
          ip,
          dskOnAir: false,
          error: String(err),
        });
        reject(new Error(String(err)));
      });

      atem.on('connected', async () => {
        clearTimeout(timeout);

        // 현재 DSK·프로그램 입력 상태 동기화
        const dskOnAir = atem.state?.video?.downstreamKeyers?.[this.config.dskIndex]?.onAir ?? false;
        const programInput = atem.state?.video?.mixEffects?.[0]?.programInput;

        // ⚠ [2026-07-08 사고 교훈] 연결 시 DSK를 절대 재설정하지 않는다.
        //   이 현장은 DSK1 = 필앤키(fill=입력4, key=입력5) 그 자체다. 과거 여기서
        //   무조건 MediaPlayer(3010)로 Fill 소스를 바꿔버려 "연결 = 회중 자막 파괴"가
        //   됐고, ATEM 시작 상태 저장조차 서버 자동 연결이 매번 덮어써 무력화됐다.
        //   미디어풀 PNG 자막(DSK) 경로가 필요한 구성은 sendSubtitle() 시점에 설정한다.

        this._setStatus({ state: 'connected', ip, dskOnAir, programInput });
        resolve();
      });

      atem.on('disconnected', () => {
        this._setStatus({ state: 'disconnected', ip, dskOnAir: false });
      });

      atem.on('stateChanged', (state, _paths) => {
        // DSK on/off·프로그램 입력 상태 실시간 동기화 (패널·타 앱에서 바꿔도 반영)
        const dskOnAir = state?.video?.downstreamKeyers?.[this.config.dskIndex]?.onAir ?? false;
        const programInput = state?.video?.mixEffects?.[0]?.programInput;
        if (dskOnAir !== this._status.dskOnAir || programInput !== this._status.programInput) {
          this._setStatus({ ...this._status, dskOnAir, programInput });
        }
      });

      atem.connect(ip);
    });
  }

  async disconnect(): Promise<void> {
    if (this.atem) {
      await this.atem.disconnect();
      this.atem = null;
    }
    this._setStatus({ state: 'disconnected', ip: this.config.ip, dskOnAir: false });
  }

  // ─── 자막 전송 ─────────────────────────────────────────────────────────────

  /**
   * 자막 PNG 이미지를 ATEM 미디어 풀에 업로드하고 DSK를 켭니다.
   *
   * @param pngBuffer - Canvas API로 생성한 투명배경 PNG Buffer
   * @param subtitleText - 로그/상태 표시용 자막 텍스트
   */
  async sendSubtitle(pngBuffer: Buffer, subtitleText: string): Promise<void> {
    if (!this.atem || !this.isConnected) {
      throw new Error('ATEM이 연결되어 있지 않습니다.');
    }

    try {
      // 0. DSK를 미디어 플레이어 소스로 전환 — 이 PNG 자막 경로를 실제로 쓸 때만.
      //    (연결 시 자동 설정 금지 — DSK1이 필앤키인 현장을 파괴했던 사고 교훈)
      await this.atem.setDownstreamKeyFillSource(this.config.mediaPlayerFillSource, this.config.dskIndex);
      await this.atem.setDownstreamKeyGeneralProperties({ preMultiply: true }, this.config.dskIndex);
      await this.atem.setDownstreamKeyRate(this.config.dskRate, this.config.dskIndex);

      // 1. 미디어 풀 슬롯에 PNG 업로드
      await this.atem.uploadStill(
        this.config.mediaSlot,
        pngBuffer,
        `subtitle_${Date.now()}`,
        subtitleText.slice(0, 64) // description 최대 64자
      );

      // 2. DSK가 꺼져 있으면 켜기 (자동 전환)
      if (!this._status.dskOnAir) {
        await this.atem.autoDownstreamKey(this.config.dskIndex, true);
      }

      this._setStatus({
        ...this._status,
        dskOnAir: true,
        lastSubtitle: subtitleText,
      });
    } catch (err) {
      throw new Error(`ATEM 자막 전송 실패: ${String(err)}`);
    }
  }

  /**
   * DSK를 끄고 자막을 숨깁니다.
   */
  async clearSubtitle(): Promise<void> {
    if (!this.atem || !this.isConnected) return;

    try {
      if (this._status.dskOnAir) {
        await this.atem.autoDownstreamKey(this.config.dskIndex, false);
      }
      this._setStatus({
        ...this._status,
        dskOnAir: false,
        lastSubtitle: undefined,
      });
    } catch (err) {
      throw new Error(`ATEM DSK 해제 실패: ${String(err)}`);
    }
  }

  /**
   * DSK를 즉시(컷) on/off 합니다. (자동 전환 없이)
   */
  async setDskOnAir(onAir: boolean): Promise<void> {
    if (!this.atem || !this.isConnected) return;
    await this.atem.setDownstreamKeyOnAir(onAir, this.config.dskIndex);
  }

  /**
   * DSK를 "필앤키(외부 입력 fill/key)" 구성으로 보증합니다.
   * 현장 부팅 시 1회 호출 — 어떤 이유로 DSK 소스가 틀어져 있어도 자막 키를 복구.
   */
  async ensureDskFillKey(fillSource: number, keySource: number, forceOnAir: boolean): Promise<void> {
    if (!this.atem || !this.isConnected) {
      throw new Error('ATEM이 연결되어 있지 않습니다.');
    }
    await this.atem.setDownstreamKeyFillSource(fillSource, this.config.dskIndex);
    await this.atem.setDownstreamKeyCutSource(keySource, this.config.dskIndex);
    await this.atem.setDownstreamKeyGeneralProperties({ preMultiply: true }, this.config.dskIndex);
    if (forceOnAir && !this._status.dskOnAir) {
      await this.atem.setDownstreamKeyOnAir(true, this.config.dskIndex);
      this._setStatus({ ...this._status, dskOnAir: true });
    }
  }

  /**
   * ME1 프로그램 입력을 컷으로 전환합니다. (카메라 선택 — CameraGrid에서 호출)
   *
   * 대상 입력이 현재 프리뷰에 있으면 스위처 관례대로 프로그램과 자리를 맞바꾼다
   * (이전 프로그램 → 프리뷰). 그렇지 않으면 프리뷰는 건드리지 않는다.
   * cut()이 아닌 명시적 2단계인 이유: cut은 넥스트 트랜지션에 묶인 USK까지
   * 토글할 수 있어 이 현장의 "스위처 상태 암묵 변경 금지" 원칙에 어긋남.
   */
  async setProgramInput(input: number): Promise<void> {
    if (!this.atem || !this.isConnected) {
      throw new Error('ATEM이 연결되어 있지 않습니다.');
    }
    const me = this.atem.state?.video?.mixEffects?.[0];
    const prevProgram = me?.programInput;
    const swapToPreview = me?.previewInput === input && typeof prevProgram === 'number' && prevProgram !== input;

    await this.atem.changeProgramInput(input, 0);
    if (swapToPreview) {
      await this.atem.changePreviewInput(prevProgram, 0);
    }
    // stateChanged가 곧 확정하지만, 폴링 UI 즉시 반영을 위해 낙관 갱신
    this._setStatus({ ...this._status, programInput: input });
  }

  // ─── 설정 변경 ─────────────────────────────────────────────────────────────

  updateConfig(config: Partial<AtemBridgeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<AtemBridgeConfig> {
    return this.config;
  }

  // ─── 내부 유틸 ─────────────────────────────────────────────────────────────

  private _setStatus(status: AtemBridgeStatus): void {
    this._status = status;
    this.onStatusChange?.(status);
  }
}

// ─── 싱글턴 인스턴스 export ──────────────────────────────────────────────────

export const AtemBridge = AtemBridgeClass.getInstance();

// ─── Canvas PNG → Buffer 변환 유틸 ──────────────────────────────────────────

/**
 * 브라우저 환경에서 HTMLCanvasElement를 PNG Buffer로 변환
 * OperatorPanel에서 직접 호출
 */
export async function canvasToPngBuffer(canvas: HTMLCanvasElement): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Canvas → Blob 변환 실패'));
        return;
      }
      const arrayBuffer = await blob.arrayBuffer();
      resolve(Buffer.from(arrayBuffer));
    }, 'image/png');
  });
}
