import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { supabase } from '../../lib/supabase'

export default function HomeScreen() {
  useEffect(() => {
    testConnection()
  }, [])

  async function testConnection() {
    const { data, error } = await supabase
      .from('memories')
      .select('*')

    if (error) {
      console.log('❌ Error:', error)
    } else {
      console.log('✅ Supabase Connected:', data)
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>PinnedMemories 💖</Text>
    </View>
  )
}