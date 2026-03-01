export type EffectsConfig = {
  kenBurns: {
    enabled: boolean;
    zoomAmount: number;
    panEnabled: boolean;
    panAmount: number;
  };
  transitions: {
    zoomPunch: {
      enabled: boolean;
      scale: number;
      durationFrames: number;
    };
    flash: {
      enabled: boolean;
      intensity: number;
      color: string;
      skipFirstScene: boolean;
    };
    shake: {
      enabled: boolean;
      intensity: number;
      durationFrames: number;
    };
  };
  vignette: {
    enabled: boolean;
    intensity: number;
  };
  glitch: {
    enabled: boolean;
    durationFrames: number;
  };
  progressBar: {
    enabled: boolean;
    height: number;
    color: string;
    position: "top" | "bottom";
  };
  chromaticAberration: {
    enabled: boolean;
    offset: number;
  };
  captions: {
    pillBackground: {
      enabled: boolean;
      color: string;
      borderRadius: number;
    };
  };
  lightLeak: {
    enabled: boolean;
    intensity: number;
    color: string;
  };
};

export const defaultEffectsConfig: EffectsConfig = {
  kenBurns: {
    enabled: true,
    zoomAmount: 0.1,
    panEnabled: false,
    panAmount: 3,
  },
  transitions: {
    zoomPunch: {
      enabled: true,
      scale: 1.04,
      durationFrames: 6,
    },
    flash: {
      enabled: true,
      intensity: 0.4,
      color: "#FFFFFF",
      skipFirstScene: false,
    },
    shake: {
      enabled: false,
      intensity: 4,
      durationFrames: 6,
    },
  },
  vignette: {
    enabled: true,
    intensity: 0.5,
  },
  glitch: {
    enabled: true,
    durationFrames: 25,
  },
  progressBar: {
    enabled: true,
    height: 42,
    color: "#FFE135",
    position: "top",
  },
  // Adds color fringing to the edges of the image
  chromaticAberration: {
    enabled: false,
    offset: 2,
  },
  captions: {
    pillBackground: {
      enabled: false,
      color: "rgba(0,0,0,0.4)",
      borderRadius: 8,
    },
  },
  lightLeak: {
    enabled: true,
    intensity: 0.5,
    color: "#FFFFFF",
  },
};
