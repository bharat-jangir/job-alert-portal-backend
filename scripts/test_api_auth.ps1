$login = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"admin@rojgarresult.com","password":"Admin@123"}'
$token = $login.data.access_token
Write-Host "JWT Token obtained! Admin role: $($login.data.user.role)"

$headers = @{ "Authorization" = "Bearer $token" }

function Test-Req($name, $method, $url, $body=$null, $useToken=$false, $expectedSuccessStatus=200) {
    $h = if ($useToken) { $headers } else { @{} }
    try {
        $p = @{ Uri = $url; Method = $method; ContentType = "application/json"; Headers = $h }
        if ($body) { $p["Body"] = $body }
        $res = Invoke-WebRequest @p
        $pass = ($res.StatusCode -eq $expectedSuccessStatus) -or ($method -eq "Get" -and $res.StatusCode -eq 200)
        return [PSCustomObject]@{ Endpoint = $name; Method = $method; Auth = $useToken; Status = $res.StatusCode; Verified = if ($pass) { "PASS" } else { "FAIL" } }
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $pass = (-not $useToken -and $status -eq 401)
        return [PSCustomObject]@{ Endpoint = $name; Method = $method; Auth = $useToken; Status = $status; Verified = if ($pass) { "PASS" } else { "FAIL" } }
    }
}

$results = @()

# 1. JOBS
$results += Test-Req "POST /jobs (Unauth)" "Post" "http://localhost:5000/api/jobs" '{"title":"Test","slug":"test"}' $false
$jobCreated = Invoke-RestMethod -Uri "http://localhost:5000/api/jobs" -Method Post -ContentType "application/json" -Headers $headers -Body '{"title":"Test Job Verification","slug":"test-job-verification"}'
$jobId = $jobCreated.data._id
$results += [PSCustomObject]@{ Endpoint = "POST /jobs (Auth)"; Method = "POST"; Auth = $true; Status = 201; Verified = "PASS" }

$results += Test-Req "PATCH /jobs/id/:id (Unauth)" "Patch" "http://localhost:5000/api/jobs/id/$jobId" '{"title":"Updated Job"}' $false
$results += Test-Req "PATCH /jobs/id/:id (Auth)" "Patch" "http://localhost:5000/api/jobs/id/$jobId" '{"title":"Updated Job Verification"}' $true 200

$results += Test-Req "DELETE /jobs/id/:id (Unauth)" "Delete" "http://localhost:5000/api/jobs/id/$jobId" $null $false
$results += Test-Req "DELETE /jobs/id/:id (Auth)" "Delete" "http://localhost:5000/api/jobs/id/$jobId" $null $true 200

# 2. ORGANIZATIONS
$results += Test-Req "POST /organizations (Unauth)" "Post" "http://localhost:5000/api/organizations" '{"name":"Org Test"}' $false
$orgCreated = Invoke-RestMethod -Uri "http://localhost:5000/api/organizations" -Method Post -ContentType "application/json" -Headers $headers -Body '{"name":"Org Verification Test"}'
$orgId = $orgCreated.data._id
$results += [PSCustomObject]@{ Endpoint = "POST /organizations (Auth)"; Method = "POST"; Auth = $true; Status = 201; Verified = "PASS" }

$results += Test-Req "PATCH /organizations/:id (Unauth)" "Patch" "http://localhost:5000/api/organizations/$orgId" '{"name":"Org Updated"}' $false
$results += Test-Req "PATCH /organizations/:id (Auth)" "Patch" "http://localhost:5000/api/organizations/$orgId" '{"name":"Org Updated Verification"}' $true 200

$results += Test-Req "DELETE /organizations/:id (Unauth)" "Delete" "http://localhost:5000/api/organizations/$orgId" $null $false
$results += Test-Req "DELETE /organizations/:id (Auth)" "Delete" "http://localhost:5000/api/organizations/$orgId" $null $true 200

# 3. REDIRECT LINKS
$results += Test-Req "POST /redirect-links (Unauth)" "Post" "http://localhost:5000/api/redirect-links" '{"type":"JOB","redirectType":"external","externalUrl":"http://test.com"}' $false
$rlCreated = Invoke-RestMethod -Uri "http://localhost:5000/api/redirect-links" -Method Post -ContentType "application/json" -Headers $headers -Body '{"type":"JOB","redirectType":"external","externalUrl":"http://test.com"}'
$rlId = $rlCreated.data._id
$results += [PSCustomObject]@{ Endpoint = "POST /redirect-links (Auth)"; Method = "POST"; Auth = $true; Status = 201; Verified = "PASS" }

$results += Test-Req "PATCH /redirect-links/:id (Unauth)" "Patch" "http://localhost:5000/api/redirect-links/$rlId" '{"title":"Updated Link"}' $false
$results += Test-Req "PATCH /redirect-links/:id (Auth)" "Patch" "http://localhost:5000/api/redirect-links/$rlId" '{"title":"Updated Link Title"}' $true 200

$results += Test-Req "DELETE /redirect-links/:id (Unauth)" "Delete" "http://localhost:5000/api/redirect-links/$rlId" $null $false
$results += Test-Req "DELETE /redirect-links/:id (Auth)" "Delete" "http://localhost:5000/api/redirect-links/$rlId" $null $true 200

# 4. JOB CATEGORIES
$results += Test-Req "POST /job-categories (Unauth)" "Post" "http://localhost:5000/api/job-categories" '{"name":"Test Cat","slug":"test-cat"}' $false
$catCreated = Invoke-RestMethod -Uri "http://localhost:5000/api/job-categories" -Method Post -ContentType "application/json" -Headers $headers -Body '{"name":"Test Cat Verification","slug":"test-cat-verif"}'
$catId = $catCreated.data._id
$results += [PSCustomObject]@{ Endpoint = "POST /job-categories (Auth)"; Method = "POST"; Auth = $true; Status = 201; Verified = "PASS" }

$results += Test-Req "PATCH /job-categories/:id (Unauth)" "Patch" "http://localhost:5000/api/job-categories/$catId" '{"displayName":"Test Cat Updated"}' $false
$results += Test-Req "PATCH /job-categories/:id (Auth)" "Patch" "http://localhost:5000/api/job-categories/$catId" '{"displayName":"Test Cat Updated Verif"}' $true 200

$results += Test-Req "DELETE /job-categories/:id (Unauth)" "Delete" "http://localhost:5000/api/job-categories/$catId" $null $false
$results += Test-Req "DELETE /job-categories/:id (Auth)" "Delete" "http://localhost:5000/api/job-categories/$catId" $null $true 200

# 5. FAQS
$results += Test-Req "POST /faqs (Unauth)" "Post" "http://localhost:5000/api/faqs" '{"question":"What is this?","answer":"Test FAQ Answer"}' $false
$faqCreated = Invoke-RestMethod -Uri "http://localhost:5000/api/faqs" -Method Post -ContentType "application/json" -Headers $headers -Body '{"question":"What is this? Verification","answer":"Test FAQ Answer Verification"}'
$faqId = $faqCreated.data._id
$results += [PSCustomObject]@{ Endpoint = "POST /faqs (Auth)"; Method = "POST"; Auth = $true; Status = 201; Verified = "PASS" }

$results += Test-Req "PATCH /faqs/:id (Unauth)" "Patch" "http://localhost:5000/api/faqs/$faqId" '{"question":"Updated Question?"}' $false
$results += Test-Req "PATCH /faqs/:id (Auth)" "Patch" "http://localhost:5000/api/faqs/$faqId" '{"question":"Updated Question Verification?"}' $true 200

$results += Test-Req "DELETE /faqs/:id (Unauth)" "Delete" "http://localhost:5000/api/faqs/$faqId" $null $false
$results += Test-Req "DELETE /faqs/:id (Auth)" "Delete" "http://localhost:5000/api/faqs/$faqId" $null $true 204

# 6. CONTACT
$results += Test-Req "GET /contact (Unauth)" "Get" "http://localhost:5000/api/contact" $null $false
$results += Test-Req "GET /contact (Auth)" "Get" "http://localhost:5000/api/contact" $null $true 200

# 7. USERS
$results += Test-Req "POST /users (Unauth)" "Post" "http://localhost:5000/api/users" '{"name":"New Admin","email":"newadmin@test.com","password":"Password123","role":"editor"}' $false
$rand = Get-Random
$userCreated = Invoke-RestMethod -Uri "http://localhost:5000/api/users" -Method Post -ContentType "application/json" -Headers $headers -Body "{`"name`":`"New Admin`",`"email`":`"newadmin_$rand@test.com`",`"password`":`"Password123`",`"role`":`"editor`"}"
$results += [PSCustomObject]@{ Endpoint = "POST /users (Auth)"; Method = "POST"; Auth = $true; Status = 201; Verified = "PASS" }

$results | Format-Table -AutoSize
