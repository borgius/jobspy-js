export const HEADERS: Record<string, string> = {
  authority: "www.glassdoor.com",
  accept: "*/*",
  "accept-language": "en-US,en;q=0.9",
  "apollographql-client-name": "job-search-next",
  "apollographql-client-version": "4.65.5",
  "content-type": "application/json",
  origin: "https://www.glassdoor.com",
  referer: "https://www.glassdoor.com/",
  "sec-ch-ua":
    '"Chromium";v="138", "Google Chrome";v="138", "Not-A.Brand";v="8"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
};

export const QUERY_TEMPLATE = `
  query JobSearchResultsQuery(
    $excludeJobListingIds: [Long!],
    $keyword: String,
    $locationId: Int,
    $locationType: LocationTypeEnum,
    $numJobsToShow: Int!,
    $pageCursor: String,
    $pageNumber: Int,
    $filterParams: [FilterParams],
    $originalPageUrl: String,
    $seoFriendlyUrlInput: String,
    $parameterUrlInput: String,
    $seoUrl: Boolean
  ) {
    jobListings(
      contextHolder: {
        searchParams: {
          excludeJobListingIds: $excludeJobListingIds,
          keyword: $keyword,
          locationId: $locationId,
          locationType: $locationType,
          numPerPage: $numJobsToShow,
          pageCursor: $pageCursor,
          pageNumber: $pageNumber,
          filterParams: $filterParams,
          originalPageUrl: $originalPageUrl,
          seoFriendlyUrlInput: $seoFriendlyUrlInput,
          parameterUrlInput: $parameterUrlInput,
          seoUrl: $seoUrl,
          searchType: SR
        }
      }
    ) {
      jobListings {
        ...JobView
        __typename
      }
      paginationCursors { cursor pageNumber __typename }
      totalJobsCount
      __typename
    }
  }

  fragment JobView on JobListingSearchResult {
    jobview {
      header {
        adOrderId advertiserType adOrderSponsorshipLevel ageInDays
        divisionEmployerName easyApply
        employer { id name shortName __typename }
        employerNameFromSearch goc gocConfidence gocId
        jobCountryId jobLink jobResultTrackingKey jobTitleText
        locationName locationType locId needsCommission
        payCurrency payPeriod
        payPeriodAdjustedPay { p10 p50 p90 __typename }
        rating salarySource savedJobId sponsored __typename
      }
      job { description importConfigId jobTitleId jobTitleText listingId __typename }
      jobListingAdminDetails {
        cpcVal importConfigId jobListingId jobSourceId
        userEligibleForAdminJobDetails __typename
      }
      overview { shortName squareLogoUrl __typename }
      __typename
    }
    __typename
  }`;

export const FALLBACK_TOKEN =
  "Ft6oHEWlRZrxDww95Cpazw:0pGUrkb2y3TyOpAIqF2vbPmUXoXVkD3oEGDVkvfeCerceQ5-n8mBg3BovySUIjmCPHCaW0H2nQVdqzbtsYqf4Q:wcqRqeegRUa9MVLJGyujVXB7vWFPjdaS1CtrrzJq-ok";
