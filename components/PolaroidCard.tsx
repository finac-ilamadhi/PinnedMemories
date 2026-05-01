import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Image,
  PanResponder,
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
  onDragStart,
  onDragEnd,
}) => {
  const position = useRef(new Animated.ValueXY({ x, y })).current
  const [isDragging, setIsDragging] = useState(false)

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
      onStartShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        setIsDragging(true)

        // ✅ bring to front using latest function
        onDragStartRef.current?.(memoryId)

        dragStart.current = positionTracker.current
      },

      onPanResponderMove: (_, gesture) => {
        position.setValue({
          x: dragStart.current.x + gesture.dx,
          y: dragStart.current.y + gesture.dy,
        })
      },

      onPanResponderRelease: (_, gesture) => {
        setIsDragging(false)

        const finalX = dragStart.current.x + gesture.dx
        const finalY = dragStart.current.y + gesture.dy

        Animated.spring(position, {
          toValue: { x: finalX, y: finalY },
          useNativeDriver: false,
          stiffness: 60,
          damping: 8,
          mass: 1,
        }).start()

        // ✅ persist using latest function
        onDragEndRef.current?.(memoryId, finalX, finalY)
      },

      onPanResponderTerminate: () => {
        setIsDragging(false)
      },
    })
  ).current

  const animatedStyle = {
    transform: [
      { translateX: position.x },
      { translateY: position.y },
      { rotate: `${rotation}deg` },
      { scale: isDragging ? scale * 1.05 : scale },
    ],
    // optional: while dragging always top
    zIndex: isDragging ? 9999 : (zIndex ?? 0),
  }

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[styles.container, animatedStyle]}
    >
      <View style={styles.card}>
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
})