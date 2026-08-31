param(
  [Parameter(Mandatory = $true)]
  [string]$Payload
)

$Command = [string[]](
  ConvertFrom-Json (
    [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Payload))
  )
)
if ($Command.Count -eq 0) {
  throw "No command was provided."
}

$executable = $Command[0]
$arguments = @()
if ($Command.Count -gt 1) {
  $arguments = $Command[1..($Command.Count - 1)]
}

& $executable @arguments
if ($null -eq $LASTEXITCODE) {
  exit 0
}
exit $LASTEXITCODE
