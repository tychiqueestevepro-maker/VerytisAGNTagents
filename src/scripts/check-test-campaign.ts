import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const supabaseUrl = 'https://plnmouvarijbldxwaqsy.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsbm1vdXZhcmlqYmxkeHdhcXN5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzIxNjgzMCwiZXhwIjoyMDkyNzkyODMwfQ.2YBot60XWi9sqWV6Xp3uCWIm6DBIKic6g9h6HAvOodQ'
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkTestCampaign() {
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, display_name, sequence_id')
    .or('name.ilike.%test%,display_name.ilike.%test%')
    .order('created_at', { ascending: false })
    .limit(5)

  let log = ""

  if (!campaigns || campaigns.length === 0) {
    log += 'No test campaign found.\n'
  } else {
    const campaign = campaigns[0]
    log += `Found campaign: ${campaign.id} (${campaign.display_name})\n`

    const { data: actions, error: actionError } = await supabase
      .from('extension_actions')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('scheduled_at', { ascending: true })

    if (actionError) {
      log += `Error fetching actions: ${JSON.stringify(actionError)}\n`
    } else {
      log += `Extension actions (${actions.length}): ${JSON.stringify(actions, null, 2)}\n`
    }

    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('extra_data->campaign_id', campaign.id)

    if (msgError) {
       log += `Error fetching messages: ${JSON.stringify(msgError)}\n`
    } else {
       log += `Messages (${messages.length}): ${JSON.stringify(messages, null, 2)}\n`
    }
  }

  fs.writeFileSync('campaign_actions_check.json', log)
  console.log('Results written to campaign_actions_check.json')
}

checkTestCampaign()
