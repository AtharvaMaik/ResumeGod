param(
  [Parameter(Mandatory=$true)][string]$ResumeJsonPath,
  [Parameter(Mandatory=$true)][string]$TemplatePath,
  [Parameter(Mandatory=$true)][string]$OutputDir,
  [Parameter(Mandatory=$true)][string]$CompanySlug
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Escape-Latex([string]$s) {
  if ($null -eq $s) { return '' }
  $s = $s -replace '\\', '\\textbackslash{}'
  $s = $s -replace '([{}_#%&$])', '\\$1'
  $s = $s -replace '~', '\\textasciitilde{}'
  $s = $s -replace '\^', '\\textasciicircum{}'
  return $s
}

function Join-Bullets([object[]]$bullets) {
  if (-not $bullets -or $bullets.Count -eq 0) { return '' }
  $lines = @('\\begin{itemize}[leftmargin=*,itemsep=1pt,topsep=2pt]')
  foreach ($b in $bullets) {
    $lines += "\\item $(Escape-Latex([string]$b))"
  }
  $lines += '\\end{itemize}'
  return ($lines -join "`n")
}

if (!(Test-Path -LiteralPath $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$data = Get-Content -Raw -LiteralPath $ResumeJsonPath | ConvertFrom-Json
$template = Get-Content -Raw -LiteralPath $TemplatePath

$summary = ($data.summary -join "`n") | ForEach-Object { Escape-Latex $_ }

$experienceBlocks = @()
foreach ($exp in @($data.experience)) {
  $header = "\\entryheader{$(Escape-Latex([string]$exp.title))}{$(Escape-Latex([string]$exp.date_range))}{$(Escape-Latex([string]$exp.company))}"
  $experienceBlocks += $header
  $experienceBlocks += (Join-Bullets @($exp.bullets))
}

$projectBlocks = @()
foreach ($p in @($data.projects)) {
  $header = "\\entryheader{$(Escape-Latex([string]$p.name))}{$(Escape-Latex([string]$p.date_range))}{$(Escape-Latex([string]$p.stack))}"
  $projectBlocks += $header
  $projectBlocks += (Join-Bullets @($p.bullets))
}

$educationBlocks = @()
foreach ($e in @($data.education)) {
  $educationBlocks += "\\entryheader{$(Escape-Latex([string]$e.degree))}{$(Escape-Latex([string]$e.date_range))}{$(Escape-Latex([string]$e.school))}"
  if ($e.details) {
    $educationBlocks += (Escape-Latex([string]$e.details))
  }
}

$skills = @()
if ($data.skills) {
  foreach ($k in $data.skills.PSObject.Properties) {
    $vals = @($k.Value) -join ', '
    $skills += "\\textbf{$(Escape-Latex($k.Name))}: $(Escape-Latex($vals))"
  }
}
$skillsBlock = ($skills -join "\\\\`n")

$certBlock = ''
if ($data.certifications -and @($data.certifications).Count -gt 0) {
  $certBlock = "\\resheading{Certifications}`n" + (Join-Bullets @($data.certifications))
}

$outTex = $template
$outTex = $outTex.Replace('<<NAME>>', Escape-Latex([string]$data.basics.name))
$outTex = $outTex.Replace('<<LOCATION>>', Escape-Latex([string]$data.basics.location))
$outTex = $outTex.Replace('<<EMAIL>>', Escape-Latex([string]$data.basics.email))
$outTex = $outTex.Replace('<<PHONE>>', Escape-Latex([string]$data.basics.phone))
$outTex = $outTex.Replace('<<WEBSITE>>', Escape-Latex([string]$data.basics.website))
$outTex = $outTex.Replace('<<LINKEDIN>>', Escape-Latex([string]$data.basics.linkedin))
$outTex = $outTex.Replace('<<GITHUB>>', Escape-Latex([string]$data.basics.github))
$outTex = $outTex.Replace('<<SUMMARY_BLOCK>>', $summary)
$outTex = $outTex.Replace('<<EXPERIENCE_BLOCK>>', ($experienceBlocks -join "`n"))
$outTex = $outTex.Replace('<<PROJECTS_BLOCK>>', ($projectBlocks -join "`n"))
$outTex = $outTex.Replace('<<EDUCATION_BLOCK>>', ($educationBlocks -join "`n"))
$outTex = $outTex.Replace('<<SKILLS_BLOCK>>', $skillsBlock)
$outTex = $outTex.Replace('<<CERTIFICATIONS_BLOCK>>', $certBlock)
$outTex = $outTex.Replace('<<UPDATED_AT>>', (Get-Date).ToString('yyyy-MM-dd HH:mm'))

$texPath = Join-Path $OutputDir 'resume.tex'
Set-Content -LiteralPath $texPath -Value $outTex -NoNewline

Push-Location $OutputDir
try {
  $compileLog = Join-Path $OutputDir 'compile.log'
  & pdflatex -interaction=nonstopmode -halt-on-error $texPath *> $compileLog
  if ($LASTEXITCODE -ne 0) {
    & latexmk -pdf -interaction=nonstopmode $texPath *> $compileLog
  }
  $pdfName = "resume_god_${CompanySlug}.pdf"
  $compiled = Join-Path $OutputDir 'resume.pdf'
  if (!(Test-Path -LiteralPath $compiled)) {
    throw "PDF compilation failed; see compile log at $compileLog"
  }
  Copy-Item -LiteralPath $compiled -Destination (Join-Path $OutputDir $pdfName) -Force
  Write-Output (ConvertTo-Json @{ resume_tex = $texPath; final_pdf = (Join-Path $OutputDir $pdfName); compile_log = $compileLog })
}
finally {
  Pop-Location
}
