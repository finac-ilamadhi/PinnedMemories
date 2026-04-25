import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import { Alert, Button, Image, ScrollView, Text, View } from 'react-native'
import { supabase } from '../../lib/supabase'

export default function HomeScreen() {
  const [memories, setMemories] = useState<any[]>([])

  useEffect(() => {
    fetchMemories()
  }, [])

  async function fetchMemories() {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.log('Fetch error:', error)
    } else {
      setMemories(data || [])
    }
  }

  async function pickImage() {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Please allow access.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    })

    if (!result.canceled) {
      uploadImage(result.assets[0].uri)
    }
  }

  async function uploadImage(uri: string) {
    try {
      const response = await fetch(uri)
      const blob = await response.blob()

      const fileName = `memory-${Date.now()}.jpg`
      const file = new File([blob], fileName, { type: blob.type })

      const { error: uploadError } = await supabase.storage
        .from('pinned-photos')
        .upload(fileName, file)

      if (uploadError) {
        console.log('Upload error:', uploadError)
        return
      }

      const { data } = supabase.storage
        .from('pinned-photos')
        .getPublicUrl(fileName)

      const publicUrl = data.publicUrl

      const { error: dbError } = await supabase
        .from('memories')
        .insert([{ image_url: publicUrl }])

      if (dbError) {
        console.log('DB error:', dbError)
      } else {
        fetchMemories() // refresh list
      }
    } catch (err) {
      console.log('Unexpected error:', err)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={{ fontSize: 22, marginBottom: 20 }}>
        PinnedMemories 💖
      </Text>

      <Button title="Upload Photo 📸" onPress={pickImage} />

      <View style={{ marginTop: 20 }}>
        {memories.map((memory) => (
          <Image
            key={memory.id}
            source={{ uri: memory.image_url }}
            style={{
              width: '100%',
              height: 250,
              marginBottom: 20,
              borderRadius: 12,
            }}
          />
        ))}
      </View>
    </ScrollView>
  )
}