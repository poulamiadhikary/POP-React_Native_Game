import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";

const { width: W, height: H } = Dimensions.get("window");
const BALL_COLORS = colors.balls;
const TICK_MS = 28;
const INITIAL_LIVES = 5;
const DANGER_ZONE = 0.72;
const NUM_PARTICLES = 9;

type BallId = string;
interface Ball {
  id: BallId;
  x: number;
  y: number;
  radius: number;
  color: string;
  speed: number;
}
interface PoppingBall extends Ball {
  done: boolean;
}

let uidCounter = 0;
function uid() {
  return (++uidCounter).toString();
}

function makeBall(score: number): Ball {
  const radius = Math.random() * 14 + 20;
  const level = Math.floor(score / 8);
  const speed = 3.2 + level * 0.35 + Math.random() * 1.0;
  return {
    id: uid(),
    x: radius + Math.random() * (W - radius * 2),
    y: -radius,
    radius,
    color: BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)],
    speed,
  };
}

interface ParticleDef {
  angle: number;
  distance: number;
  size: number;
  color: string;
}

function Particle({
  cx,
  cy,
  def,
  progress,
}: {
  cx: number;
  cy: number;
  def: ParticleDef;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const ease = 1 - Math.pow(1 - p, 2);
    const dx = Math.cos(def.angle) * def.distance * ease;
    const dy = Math.sin(def.angle) * def.distance * ease;
    const scale = 1 - p * 0.7;
    return {
      position: "absolute",
      left: cx + dx - def.size / 2,
      top: cy + dy - def.size / 2,
      width: def.size,
      height: def.size,
      borderRadius: def.size / 2,
      backgroundColor: def.color,
      opacity: 1 - p,
      transform: [{ scale }],
    };
  });
  return <Animated.View style={style} pointerEvents="none" />;
}

function AnimatedPop({ ball, onDone }: { ball: PoppingBall; onDone: () => void }) {
  const progress = useSharedValue(0);

  const particles = useMemo<ParticleDef[]>(() => {
    return Array.from({ length: NUM_PARTICLES }, (_, i) => {
      const baseAngle = (i / NUM_PARTICLES) * Math.PI * 2;
      const jitter = (Math.random() - 0.5) * ((Math.PI * 2) / NUM_PARTICLES) * 0.9;
      const angle = baseAngle + jitter;
      const distance = ball.radius * 1.1 + Math.random() * ball.radius * 1.0;
      const size = ball.radius * 0.22 + Math.random() * ball.radius * 0.22;
      const useWhite = Math.random() > 0.65;
      return { angle, distance, size, color: useWhite ? "#ffffff" : ball.color };
    });
  }, []);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 420 }, (fin) => {
      if (fin) runOnJS(onDone)();
    });
  }, []);

  return (
    <>
      {particles.map((def, i) => (
        <Particle key={i} cx={ball.x} cy={ball.y} def={def} progress={progress} />
      ))}
    </>
  );
}

function DangerFlash({ gameAreaHeight }: { gameAreaHeight: number }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.18, { duration: 380 }),
        withTiming(0, { duration: 380 })
      ),
      -1,
      false
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: gameAreaHeight * 0.22,
    backgroundColor: "#ff3333",
    opacity: opacity.value,
  }));

  return <Animated.View style={style} pointerEvents="none" />;
}

function BallItem({
  ball,
  gameAreaHeight,
  onPop,
}: {
  ball: Ball;
  gameAreaHeight: number;
  onPop: (b: Ball) => void;
}) {
  const proximity = ball.y / gameAreaHeight;
  const inDanger = proximity > DANGER_ZONE;
  const dangerIntensity = inDanger
    ? Math.min(1, (proximity - DANGER_ZONE) / (1 - DANGER_ZONE))
    : 0;

  return (
    <Pressable
      onPress={() => onPop(ball)}
      style={{
        position: "absolute",
        left: ball.x - ball.radius,
        top: ball.y - ball.radius,
        width: ball.radius * 2,
        height: ball.radius * 2,
        borderRadius: ball.radius,
        backgroundColor: inDanger
          ? blendToRed(ball.color, dangerIntensity * 0.5)
          : ball.color,
        shadowColor: inDanger ? "#ff2222" : ball.color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: inDanger ? 0.9 : 0.7,
        shadowRadius: inDanger ? 18 + dangerIntensity * 12 : 10,
      }}
    />
  );
}

function blendToRed(hex: string, t: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.round(r + (255 - r) * t);
  const ng = Math.round(g * (1 - t));
  const nb = Math.round(b * (1 - t));
  return `rgb(${nr},${ng},${nb})`;
}

export default function GameScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 80 : insets.top + 8;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const gameAreaHeight = H - topPad - 72 - bottomPad;

  const [balls, setBalls] = useState<Ball[]>([]);
  const [pops, setPops] = useState<PoppingBall[]>([]);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  const ballsRef = useRef<Ball[]>([]);
  const scoreRef = useRef(0);
  const livesRef = useRef(INITIAL_LIVES);
  const gameOverRef = useRef(false);
  const bestRef = useRef(0);
  const tickRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);

  const clearLoop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetGame = useCallback(() => {
    clearLoop();
    ballsRef.current = [];
    scoreRef.current = 0;
    livesRef.current = INITIAL_LIVES;
    gameOverRef.current = false;
    pausedRef.current = false;
    tickRef.current = 0;
    setBalls([]);
    setPops([]);
    setScore(0);
    setLives(INITIAL_LIVES);
    setGameOver(false);
    setPaused(false);
    setStarted(true);
    setGameKey((k) => k + 1);
  }, [clearLoop]);

  const togglePause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  }, []);

  useEffect(() => {
    if (!started) return;

    intervalRef.current = setInterval(() => {
      if (gameOverRef.current || pausedRef.current) return;

      tickRef.current += 1;
      const level = Math.floor(scoreRef.current / 8);
      const spawnEvery = Math.max(16, 42 - level * 3);

      if (tickRef.current % spawnEvery === 0) {
        const qty = level >= 5 ? 2 : 1;
        const newBalls = Array.from({ length: qty }, () => makeBall(scoreRef.current));
        ballsRef.current = [...ballsRef.current, ...newBalls];
      }

      const escaped: Ball[] = [];
      const remaining: Ball[] = [];
      for (const b of ballsRef.current) {
        const newY = b.y + b.speed;
        if (newY - b.radius > gameAreaHeight) {
          escaped.push(b);
        } else {
          remaining.push({ ...b, y: newY });
        }
      }

      ballsRef.current = remaining;
      setBalls([...remaining]);

      if (escaped.length > 0) {
        livesRef.current = Math.max(0, livesRef.current - escaped.length);
        setLives(livesRef.current);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        if (livesRef.current <= 0) {
          gameOverRef.current = true;
          setGameOver(true);
          clearLoop();
        }
      }
    }, TICK_MS);

    return () => clearLoop();
  }, [started, gameKey, gameAreaHeight, clearLoop]);

  const popBall = useCallback((ball: Ball) => {
    if (gameOverRef.current || pausedRef.current) return;
    ballsRef.current = ballsRef.current.filter((b) => b.id !== ball.id);
    setBalls((prev) => prev.filter((b) => b.id !== ball.id));
    setPops((prev) => [...prev, { ...ball, done: false }]);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    scoreRef.current += 1;
    setScore(scoreRef.current);
    if (scoreRef.current > bestRef.current) {
      bestRef.current = scoreRef.current;
      setBestScore(scoreRef.current);
    }
  }, []);

  const removePop = useCallback((id: BallId) => {
    setPops((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const gameAreaTop = topPad + 72;
  const isPlaying = started && !gameOver;

  return (
    <View style={[styles.root, { backgroundColor: colors.light.background }]}>
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Pop!</Text>
          <View style={styles.livesRow}>
            {Array.from({ length: INITIAL_LIVES }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.lifeDot,
                  { backgroundColor: i < lives ? "#ff6b6b" : "#2a2a3e" },
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.headerCenter}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>SCORE</Text>
            <Text style={styles.scoreNum}>{score}</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>BEST</Text>
            <Text style={styles.scoreNum}>{bestScore}</Text>
          </View>
        </View>

        <View style={styles.headerButtons}>
          {isPlaying && (
            <>
              <Pressable onPress={togglePause} style={styles.iconBtn} hitSlop={8}>
                <Feather name={paused ? "play" : "pause"} size={20} color="#ffffff" />
              </Pressable>
              <Pressable onPress={resetGame} style={styles.iconBtn} hitSlop={8}>
                <Feather name="refresh-cw" size={18} color="#ffffff" />
              </Pressable>
            </>
          )}
        </View>
      </View>

      <View
        style={[
          styles.gameArea,
          { top: gameAreaTop, bottom: bottomPad, left: 0, right: 0 },
        ]}
        pointerEvents="box-none"
      >
        <DangerFlash gameAreaHeight={gameAreaHeight} />
        <View
          style={[styles.dangerLine, { top: gameAreaHeight * DANGER_ZONE }]}
          pointerEvents="none"
        />
        {balls.map((ball) => (
          <BallItem
            key={ball.id}
            ball={ball}
            gameAreaHeight={gameAreaHeight}
            onPop={popBall}
          />
        ))}
        {pops.map((pop) => (
          <AnimatedPop key={pop.id} ball={pop} onDone={() => removePop(pop.id)} />
        ))}
      </View>

      {!started && !gameOver && (
        <View style={styles.centerOverlay}>
          <Text style={styles.overlayEmoji}>●</Text>
          <Text style={styles.overlayTitle}>Pop the Balls!</Text>
          <Text style={styles.overlaySubtitle}>
            Balls fall fast — tap them before they escape.{"\n"}
            Miss 5 and it's game over.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={resetGame}>
            <Text style={styles.primaryBtnText}>Start</Text>
          </Pressable>
        </View>
      )}

      {paused && isPlaying && (
        <View style={styles.centerOverlay}>
          <Text style={styles.overlayTitle}>Paused</Text>
          <Text style={styles.overlaySubtitle}>Take a breath...</Text>
          <View style={styles.overlayButtons}>
            <Pressable style={styles.primaryBtn} onPress={togglePause}>
              <Feather name="play" size={18} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.primaryBtnText}>Resume</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={resetGame}>
              <Feather name="refresh-cw" size={16} color="#8888aa" style={{ marginRight: 6 }} />
              <Text style={styles.secondaryBtnText}>Restart</Text>
            </Pressable>
          </View>
        </View>
      )}

      {gameOver && (
        <View style={styles.centerOverlay}>
          <Text style={styles.overlayTitle}>Game Over</Text>
          <Text style={styles.overlayScore}>{score} popped</Text>
          {score > 0 && score >= bestScore && (
            <Text style={styles.newBest}>New Best!</Text>
          )}
          <Pressable style={styles.primaryBtn} onPress={resetGame}>
            <Text style={styles.primaryBtnText}>Try Again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  headerLeft: { gap: 6, flex: 1 },
  title: { fontSize: 30, fontFamily: "Inter_700Bold", color: "#ffffff", lineHeight: 34 },
  livesRow: { flexDirection: "row", gap: 5 },
  lifeDot: { width: 11, height: 11, borderRadius: 6 },
  headerCenter: { flexDirection: "row", gap: 8, flex: 1, justifyContent: "center" },
  scoreBox: {
    backgroundColor: "#1e1e30",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: "center",
    minWidth: 64,
  },
  scoreLabel: { color: "#8888aa", fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  scoreNum: { color: "#ffffff", fontSize: 18, fontFamily: "Inter_700Bold" },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  iconBtn: {
    backgroundColor: "#1e1e30",
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  gameArea: { position: "absolute", overflow: "hidden" },
  dangerLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(255,50,50,0.25)",
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,10,20,0.92)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    zIndex: 20,
  },
  overlayEmoji: { fontSize: 52, color: "#ff6b6b", lineHeight: 60 },
  overlayTitle: { color: "#ffffff", fontSize: 40, fontFamily: "Inter_700Bold" },
  overlaySubtitle: {
    color: "#8888aa",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 40,
  },
  overlayScore: { color: "#ffffff", fontSize: 22, fontFamily: "Inter_600SemiBold" },
  newBest: { color: "#ffd93d", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  overlayButtons: { gap: 12, alignItems: "center", marginTop: 4 },
  primaryBtn: {
    backgroundColor: "#6c63ff",
    borderRadius: 14,
    paddingHorizontal: 36,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  primaryBtnText: { color: "#ffffff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  secondaryBtn: {
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  secondaryBtnText: { color: "#8888aa", fontSize: 15, fontFamily: "Inter_500Medium" },
});