import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import CountryInput from './country-input'
import DownshiftInput from '../downshift-input'
import EmailAffiliatedWithInstitution from './email-affiliated-with-institution'
import defaultRoles from '../../../data/roles'
import defaultDepartments from '../../../data/departments'
import { CountryCode } from '../../../data/countries-list'
import { University } from '../../../../../../../types/university'
import { InstitutionInfo } from './input'
import { getJSON } from '../../../../../infrastructure/fetch-json'
import useAsync from '../../../../../shared/hooks/use-async'
import UniversityName from './university-name'

type InstitutionFieldsProps = {
  countryCode: CountryCode | null
  setCountryCode: React.Dispatch<React.SetStateAction<CountryCode | null>>
  universities: Partial<Record<CountryCode, University[]>>
  setUniversities: React.Dispatch<
    React.SetStateAction<Partial<Record<CountryCode, University[]>>>
  >
  universityName: string
  setUniversityName: React.Dispatch<React.SetStateAction<string>>
  role: string
  setRole: React.Dispatch<React.SetStateAction<string>>
  department: string
  setDepartment: React.Dispatch<React.SetStateAction<string>>
  newEmailMatchedInstitution: InstitutionInfo | null
}

function InstitutionFields({
  countryCode,
  setCountryCode,
  universities,
  setUniversities,
  universityName,
  setUniversityName,
  role,
  setRole,
  department,
  setDepartment,
  newEmailMatchedInstitution,
}: InstitutionFieldsProps) {
  const { t } = useTranslation()
  const countryRef = useRef<HTMLInputElement | null>(null)
  const [departments, setDepartments] = useState<string[]>([
    ...defaultDepartments,
  ])
  const [isInstitutionFieldsVisible, setIsInstitutionFieldsVisible] =
    useState(false)
  const [isUniversityDirty, setIsUniversityDirty] = useState(false)
  const { runAsync: institutionRunAsync } = useAsync()

  useEffect(() => {
    if (isInstitutionFieldsVisible && countryRef.current) {
      countryRef.current?.focus()
    }
  }, [countryRef, isInstitutionFieldsVisible])

  useEffect(() => {
    if (universityName) {
      setIsUniversityDirty(true)
    }
  }, [setIsUniversityDirty, universityName])

  // If the institution selected by autocompletion has changed
  // hide the fields visibility and reset values
  useEffect(() => {
    if (!newEmailMatchedInstitution) {
      setIsInstitutionFieldsVisible(false)
      setRole('')
      setDepartment('')
    }
  }, [newEmailMatchedInstitution, setRole, setDepartment])

  useEffect(() => {
    const selectedKnownUniversity = countryCode
      ? universities[countryCode]?.find(({ name }) => name === universityName)
      : undefined

    if (selectedKnownUniversity && selectedKnownUniversity.departments.length) {
      setDepartments(selectedKnownUniversity.departments)
    } else {
      setDepartments([...defaultDepartments])
    }
  }, [countryCode, universities, universityName])

  // Fetch country institution
  useEffect(() => {
    // Skip if country not selected or universities for
    // that country are already fetched
    if (!countryCode || universities[countryCode]) {
      return
    }

    institutionRunAsync<University[]>(
      getJSON(`/institutions/list?country_code=${countryCode}`)
    )
      .then(data => {
        setUniversities(state => ({ ...state, [countryCode]: data }))
      })
      .catch(() => {})
  }, [countryCode, universities, setUniversities, institutionRunAsync])

  const getUniversityItems = () => {
    if (!countryCode) {
      return []
    }

    return universities[countryCode]?.map(({ name }) => name) ?? []
  }

  const handleShowInstitutionFields = () => {
    setIsInstitutionFieldsVisible(true)
  }

  const handleSelectUniversityManually = () => {
    setRole('')
    setDepartment('')
    handleShowInstitutionFields()
  }

  const isLetUsKnowVisible =
    !newEmailMatchedInstitution && !isInstitutionFieldsVisible
  const isAutocompletedInstitutionVisible =
    newEmailMatchedInstitution && !isInstitutionFieldsVisible
  const isRoleAndDepartmentVisible =
    isAutocompletedInstitutionVisible || isUniversityDirty

  // Is the email affiliated with an institution?
  if (isLetUsKnowVisible) {
    return (
      <EmailAffiliatedWithInstitution onClick={handleShowInstitutionFields} />
    )
  }

  return (
    <>
      {isAutocompletedInstitutionVisible ? (
        // Display the institution name after autocompletion
        <UniversityName
          name={newEmailMatchedInstitution.university.name}
          onClick={handleSelectUniversityManually}
        />
      ) : (
        // Display the country and university fields
        <>
          <div className="form-group mb-2">
            <CountryInput
              id="new-email-country-input"
              setValue={setCountryCode}
              ref={countryRef}
            />
          </div>
          <div
            className={`form-group ${
              isRoleAndDepartmentVisible ? 'mb-2' : 'mb-0'
            }`}
          >
            <DownshiftInput
              items={getUniversityItems()}
              inputValue={universityName}
              placeholder={t('university')}
              label={t('university')}
              setValue={setUniversityName}
              disabled={!countryCode}
            />
          </div>
        </>
      )}
      {isRoleAndDepartmentVisible && (
        <>
          <div className="form-group mb-2">
            <DownshiftInput
              items={[...defaultRoles]}
              inputValue={role}
              placeholder={t('role')}
              label={t('role')}
              setValue={setRole}
            />
          </div>
          <div className="form-group mb-0">
            <DownshiftInput
              items={departments}
              inputValue={department}
              placeholder={t('department')}
              label={t('department')}
              setValue={setDepartment}
            />
          </div>
        </>
      )}
    </>
  )
}

export default InstitutionFields
