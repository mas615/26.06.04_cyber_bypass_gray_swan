param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutputFull = [System.IO.Path]::GetFullPath($OutputPath)

if (-not $resolvedOutputFull.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputPath must be under $projectRoot"
}

function Get-FirstMatchValue {
  param([string]$Text, [string]$Pattern)
  $match = [regex]::Match($Text, $Pattern, [Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success -and $match.Groups.Count -gt 1) {
    return $match.Groups[1].Value
  }
  return $null
}

function ConvertTo-ObjectOrNull {
  param($Text)
  if ([string]::IsNullOrWhiteSpace([string]$Text)) {
    return $null
  }
  try {
    return ([string]$Text | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Get-PropertyNames {
  param($Object)
  if ($null -eq $Object) {
    return @()
  }
  return @($Object.PSObject.Properties | ForEach-Object { $_.Name })
}

function Get-TextBlocks {
  param($Content)
  $texts = New-Object System.Collections.Generic.List[string]
  if ($null -eq $Content) {
    return @()
  }

  foreach ($block in @($Content)) {
    if ($block -is [string]) {
      $texts.Add($block) | Out-Null
    } elseif ($block.type -eq "text" -and $block.text) {
      $texts.Add([string]$block.text) | Out-Null
    }
  }

  return @($texts.ToArray())
}

function Add-SseEvent {
  param($Events, $EventName, $DataLines, $SourceLine)
  if (-not $EventName) {
    return
  }

  $dataText = ($DataLines.ToArray() -join "`n")
  $parsed = $null
  $parseError = $null

  if ($dataText) {
    try {
      $parsed = $dataText | ConvertFrom-Json
    } catch {
      $parseError = $_.Exception.Message
    }
  }

  $Events.Add([pscustomobject]@{
    order = $Events.Count + 1
    event = $EventName
    source_line = $SourceLine
    data = $parsed
    data_parse_error = $parseError
    data_text_preview = if ($dataText.Length -gt 500) { $dataText.Substring(0, 500) + "..." } else { $dataText }
  }) | Out-Null
}

$raw = Get-Content -Raw -LiteralPath $resolvedInput
$responseText = $null
$inputFormat = "raw_sse_or_http"

$responseBase64 = Get-FirstMatchValue $raw '<response base64="true"><!\[CDATA\[(.*?)\]\]></response>'
if ($responseBase64) {
  $inputFormat = "burp_xml_response_base64"
  $responseText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($responseBase64))
} else {
  $responsePlain = Get-FirstMatchValue $raw '<response base64="false"><!\[CDATA\[(.*?)\]\]></response>'
  if ($responsePlain) {
    $inputFormat = "burp_xml_response_plain"
    $responseText = $responsePlain
  } else {
    $responseText = $raw
  }
}

$bodyParts = $responseText -split "\r?\n\r?\n", 2
$sseBody = if ($bodyParts.Count -gt 1) { $bodyParts[1] } else { $responseText }
$lines = $sseBody -split "\r?\n"

$events = New-Object System.Collections.Generic.List[object]
$currentEvent = $null
$dataLines = New-Object System.Collections.Generic.List[string]
$sourceLine = 0

for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]

  if ($line -match '^event:\s*(.+)$') {
    Add-SseEvent -Events $events -EventName $currentEvent -DataLines $dataLines -SourceLine $sourceLine
    $currentEvent = $Matches[1].Trim()
    $dataLines = New-Object System.Collections.Generic.List[string]
    $sourceLine = $i + 1
  } elseif ($line -match '^data:\s?(.*)$') {
    $dataLines.Add($Matches[1]) | Out-Null
  } elseif ([string]::IsNullOrWhiteSpace($line)) {
    Add-SseEvent -Events $events -EventName $currentEvent -DataLines $dataLines -SourceLine $sourceLine
    $currentEvent = $null
    $dataLines = New-Object System.Collections.Generic.List[string]
    $sourceLine = 0
  }
}
Add-SseEvent -Events $events -EventName $currentEvent -DataLines $dataLines -SourceLine $sourceLine

$apiTraces = New-Object System.Collections.Generic.List[object]
foreach ($event in $events) {
  if ($event.event -ne "api_trace") {
    continue
  }

  $data = $event.data
  $payload = $data.payload

  $requestSummary = $null
  if ($payload -and $payload.request) {
    $requestObject = ConvertTo-ObjectOrNull $payload.request
    if ($requestObject) {
      $userTexts = New-Object System.Collections.Generic.List[string]
      foreach ($message in @($requestObject.messages)) {
        foreach ($text in Get-TextBlocks $message.content) {
          if ($text -and -not $text.StartsWith("<system-reminder>")) {
            $userTexts.Add($text) | Out-Null
          }
        }
      }

      $requestSummary = [pscustomobject]@{
        model = $requestObject.model
        max_tokens = $requestObject.max_tokens
        stream = $requestObject.stream
        message_count = @($requestObject.messages).Count
        system_block_count = @($requestObject.system).Count
        tool_count = @($requestObject.tools).Count
        tool_names = @($requestObject.tools | ForEach-Object { $_.name } | Where-Object { $_ })
        visible_user_texts = @($userTexts.ToArray())
      }
    } else {
      $requestSummary = [pscustomobject]@{
        parse_error = $true
        preview = if (([string]$payload.request).Length -gt 300) { ([string]$payload.request).Substring(0, 300) + "..." } else { [string]$payload.request }
      }
    }
  }

  $responseSummary = $null
  if ($payload -and $payload.response) {
    $responseObject = ConvertTo-ObjectOrNull $payload.response
    if ($responseObject) {
      $responseSummary = [pscustomobject]@{
        id = $responseObject.id
        type = $responseObject.type
        role = $responseObject.role
        model = $responseObject.model
        stop_reason = $responseObject.stop_reason
        content_text = @(Get-TextBlocks $responseObject.content)
        usage = $responseObject.usage
      }
    } else {
      $responseSummary = [pscustomobject]@{
        preview = if (([string]$payload.response).Length -gt 300) { ([string]$payload.response).Substring(0, 300) + "..." } else { [string]$payload.response }
      }
    }
  }

  $apiTraces.Add([pscustomobject]@{
    event_order = $event.order
    source_line = $event.source_line
    type = $data.type
    timestamp = $data.timestamp
    status = $data.status
    text = $data.text
    http = if ($payload) {
      [pscustomobject]@{
        method = $payload.method
        path = $payload.path
        duration_ms = if ($payload.duration_ms) { $payload.duration_ms } else { $payload.duration }
        status = $payload.status
        request_header_keys = @(Get-PropertyNames $payload.req_headers)
        response_header_keys = @(Get-PropertyNames $payload.resp_headers)
      }
    } else {
      $null
    }
    request_summary = $requestSummary
    response_summary = $responseSummary
  }) | Out-Null
}

$eventCounts = @($events | Group-Object -Property event | Sort-Object Name | ForEach-Object {
  [pscustomobject]@{ event = $_.Name; count = $_.Count }
})

$output = [pscustomobject]@{
  source_file = $resolvedInput
  input_format = $inputFormat
  saved_at = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss KST")
  note = "Sensitive header values and raw request/response bodies were intentionally omitted; only header names and parsed summaries are saved."
  burp = [pscustomobject]@{
    export_time = Get-FirstMatchValue $raw '<items[^>]*exportTime="([^"]+)"'
    burp_version = Get-FirstMatchValue $raw '<items[^>]*burpVersion="([^"]+)"'
    item_time = Get-FirstMatchValue $raw '<time>(.*?)</time>'
    url = Get-FirstMatchValue $raw '<url><!\[CDATA\[(.*?)\]\]></url>'
    method = Get-FirstMatchValue $raw '<method><!\[CDATA\[(.*?)\]\]></method>'
    path = Get-FirstMatchValue $raw '<path><!\[CDATA\[(.*?)\]\]></path>'
    status = Get-FirstMatchValue $raw '<status>(.*?)</status>'
  }
  sse_event_counts = $eventCounts
  api_trace_count = $apiTraces.Count
  api_traces = @($apiTraces.ToArray())
  all_events_sanitized = @($events | ForEach-Object {
    [pscustomobject]@{
      order = $_.order
      event = $_.event
      source_line = $_.source_line
      data_preview = $_.data_text_preview
    }
  })
}

$outDir = Split-Path -Parent $resolvedOutputFull
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$output | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $resolvedOutputFull -Encoding UTF8

Write-Output $resolvedOutputFull
