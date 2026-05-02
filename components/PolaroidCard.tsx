import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

interface PolaroidCardProps {
  imageUrl: string
  memoryId: string
  x: number
  y: number
  caption?: string
  zIndex?: number
  boardWidth: number
  boardHeight: number
  menuOpen: boolean
  userScale: number
  onResize?: (id: string, scale: number) => void
  onLongPressMenu?: (id: string) => void
  onRequestDelete?: (id: string) => void
  onDragStart?: (id: string) => void
  onDragEnd?: (id: string, x: number, y: number) => void
}

function generateStableStyle(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }

  const rotation = (hash % 12) - 6
  const scale = 0.97 + (Math.abs(hash) % 5) / 100

  const PIN_COLORS = ['#E85A4F', '#5DA9A6', '#F2C14E']
  const pinColor = PIN_COLORS[Math.abs(hash) % PIN_COLORS.length]

  return { rotation, scale, pinColor }
}

export const PolaroidCard: React.FC<PolaroidCardProps> = ({
  imageUrl,
  memoryId,
  x,
  y,
  caption,
  zIndex,
  boardWidth,
  boardHeight,
  menuOpen,
  userScale,
  onResize,
  onLongPressMenu,
  onRequestDelete,
  onDragStart,
  onDragEnd,
}) => {
  const position = useRef(new Animated.ValueXY({ x, y })).current
  const [isDragging, setIsDragging] = useState(false)
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 })
  const longPressTimer = useRef<any>(null)
  const menuOpenRef = useRef(menuOpen)

  useEffect(() => {
    menuOpenRef.current = menuOpen
  }, [menuOpen])

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])

  const clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), max)

  const clampScale = (s: number) => Math.min(1.4, Math.max(0.7, s))

  const SNAP = 24 // grid size in pixels
  const MAGNET = 14 // only snap if within 14px of grid line

  const snapToGrid = (v: number) => Math.round(v / SNAP) * SNAP
  const maybeSnap = (v: number) => {
    const snapped = snapToGrid(v)
    return Math.abs(snapped - v) <= MAGNET ? snapped : v
  }

  // ✅ keep latest callbacks (fixes "only once" bug)
  const onDragStartRef = useRef(onDragStart)
  const onDragEndRef = useRef(onDragEnd)

  useEffect(() => {
    onDragStartRef.current = onDragStart
  }, [onDragStart])

  useEffect(() => {
    onDragEndRef.current = onDragEnd
  }, [onDragEnd])

  // ✅ Sync from props, but don't fight the user while dragging
  useEffect(() => {
    if (isDragging) return
    position.setValue({ x, y })
  }, [x, y])

  const { rotation, scale, pinColor } = useMemo(
    () => generateStableStyle(memoryId),
    [memoryId]
  )

  const dragStart = useRef({ x, y })
  const positionTracker = useRef({ x, y })

  useEffect(() => {
    const subId = position.addListener((value) => {
      positionTracker.current = value
    })
    return () => position.removeListener(subId)
  }, [position])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !menuOpenRef.current,
      onMoveShouldSetPanResponder: () => !menuOpenRef.current,

      onPanResponderGrant: () => {
        setIsDragging(true)

        // ✅ bring to front using latest function
        onDragStartRef.current?.(memoryId)

        dragStart.current = positionTracker.current

        // ✅ setup long press timer
        longPressTimer.current = setTimeout(() => {
          onLongPressMenu?.(memoryId)
          setIsDragging(false)
          longPressTimer.current = null
        }, 450)
      },

      onPanResponderMove: (_, gesture) => {
        // ✅ cancel long press if moved significantly
        if (Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5) {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current)
            longPressTimer.current = null
          }
        }

        if (longPressTimer.current) return

        let nextX = dragStart.current.x + gesture.dx
        let nextY = dragStart.current.y + gesture.dy

        if (
          boardWidth > 0 &&
          boardHeight > 0 &&
          cardSize.width > 0 &&
          cardSize.height > 0
        ) {
          const margin = 10
          const effectiveW = cardSize.width * userScale
          const effectiveH = cardSize.height * userScale
          nextX = clamp(nextX, margin, boardWidth - effectiveW - margin)
          nextY = clamp(nextY, margin, boardHeight - effectiveH - margin)
        }

        position.setValue({ x: nextX, y: nextY })
      },

      onPanResponderRelease: (_, gesture) => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current)
          longPressTimer.current = null
        }

        setIsDragging(false)

        const finalX = dragStart.current.x + gesture.dx
        const finalY = dragStart.current.y + gesture.dy

        // 1. Apply magnetic snap
        let snappedX = maybeSnap(finalX)
        let snappedY = maybeSnap(finalY)

        // 2. Apply clamp (important after snap)
        if (
          boardWidth > 0 &&
          boardHeight > 0 &&
          cardSize.width > 0 &&
          cardSize.height > 0
        ) {
          const margin = 10
          const effectiveW = cardSize.width * userScale
          const effectiveH = cardSize.height * userScale
          snappedX = clamp(snappedX, margin, boardWidth - effectiveW - margin)
          snappedY = clamp(snappedY, margin, boardHeight - effectiveH - margin)
        }

        Animated.spring(position, {
          toValue: { x: snappedX, y: snappedY },
          useNativeDriver: false,
          stiffness: 55,
          damping: 9,
          mass: 1,
        }).start()

        // ✅ persist using latest function (snapped)
        onDragEndRef.current?.(memoryId, snappedX, snappedY)
      },

      onPanResponderTerminate: () => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current)
          longPressTimer.current = null
        }
        setIsDragging(false)
      },
    })
  ).current

  const animatedStyle = {
    transform: [
      { translateX: position.x },
      { translateY: position.y },
      { rotate: `${rotation}deg` },
      { scale: (isDragging ? scale * 1.05 : scale) * userScale },
    ],
    // optional: while dragging always top
    zIndex: isDragging ? 9999 : (zIndex ?? 0),
  }

  const panHandlers = menuOpen ? {} : panResponder.panHandlers

  return (
    <Animated.View
      {...(panHandlers as any)}
      pointerEvents={menuOpen ? 'box-none' : 'auto'}
      style={[styles.container, animatedStyle]}
    >
      <View
        style={styles.card}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout
          setCardSize({ width, height })
        }}
      >
        <Image source={{ uri: imageUrl }} style={styles.image} />

        {caption ? (
          <Text style={styles.caption}>{caption}</Text>
        ) : (
          <View style={styles.spacer} />
        )}

        <View style={styles.pinContainer}>
          <View style={[styles.pin, { backgroundColor: pinColor }]}>
            <View style={styles.pinHighlight} />
          </View>
        </View>

        {/* Delete Menu Overlay */}
        {menuOpen && (
          <View style={styles.menuOverlay}>
            <View style={styles.resizeRow}>
              <Pressable
                style={styles.resizeButton}
                onPress={(e: any) => {
                  e?.stopPropagation?.()
                  onResize?.(memoryId, clampScale(userScale - 0.1))
                }}
              >
                <Text style={styles.resizeText}>Smaller ➖</Text>
              </Pressable>
              <Pressable
                style={styles.resizeButton}
                onPress={(e: any) => {
                  e?.stopPropagation?.()
                  onResize?.(memoryId, clampScale(userScale + 0.1))
                }}
              >
                <Text style={styles.resizeText}>Bigger ➕</Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.deleteButton}
              onPress={(e: any) => {
                e?.stopPropagation?.()
                onRequestDelete?.(memoryId)
              }}
            >
              <Text style={styles.deleteText}>Delete 🗑️</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFDF9',
    padding: 14,
    paddingBottom: 28,
    borderRadius: 10,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
    position: 'relative',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 4,
    backgroundColor: '#eee',
  },
  spacer: { height: 10 },
  caption: {
    marginTop: 10,
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  pinContainer: {
    position: 'absolute',
    top: -8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  pin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  pinHighlight: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
    position: 'absolute',
    top: 3,
    left: 4,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  deleteButton: {
    backgroundColor: '#E85A4F',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  deleteText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  resizeRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  resizeButton: {
    backgroundColor: '#FFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#eee',
    minWidth: 80,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  resizeText: {
    color: '#333',
    fontSize: 12,
    fontWeight: '600',
  },
})