import { LemonSkeleton } from 'lib/lemon-ui/LemonSkeleton'
import { LemonSnack } from 'lib/lemon-ui/LemonSnack/LemonSnack'
import { range } from 'lib/utils'
import { useEffect, useMemo, useRef, useState } from 'react'

import { KeyboardShortcut } from '~/layout/navigation-3000/components/KeyboardShortcut'

import { LemonButton } from '../LemonButton'
import { LemonDropdown, LemonDropdownProps } from '../LemonDropdown'
import { LemonInput } from '../LemonInput'
import { PopoverReferenceContext } from '../Popover'

export interface LemonInputSelectOption {
    key: string
    label: string
    labelComponent?: React.ReactNode
}

export type LemonInputSelectProps = {
    options?: LemonInputSelectOption[]
    value?: string[] | null
    disabled?: boolean
    loading?: boolean
    placeholder?: string
    disableFiltering?: boolean
    mode: 'multiple' | 'single'
    allowCustomValues?: boolean
    onChange?: (newValue: string[]) => void
    onInputChange?: (newValue: string) => void
    'data-attr'?: string
    dropdownProps?: Partial<LemonDropdownProps>
}

export function LemonInputSelect({
    placeholder,
    options = [],
    value,
    loading,
    onChange,
    onInputChange,
    mode,
    disabled,
    disableFiltering = false,
    allowCustomValues = false,
    dropdownProps = {},
    ...props
}: LemonInputSelectProps): JSX.Element {
    const [showPopover, setShowPopover] = useState(false)
    const [inputValue, _setInputValue] = useState('')
    const popoverFocusRef = useRef<boolean>(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const values = value ?? []

    const visibleOptions = useMemo(() => {
        const res: LemonInputSelectOption[] = []
        const customValues = [...values]

        options.forEach((option) => {
            // Remove from the custom values list if it's in the options

            if (customValues.includes(option.key)) {
                customValues.splice(customValues.indexOf(option.key), 1)
            }

            // Check for filtering
            if (inputValue && !disableFiltering && !option.label.toLowerCase().includes(inputValue.toLowerCase())) {
                return
            }

            res.push(option)
        })

        // Custom values are always shown before the list
        if (customValues.length) {
            customValues.forEach((value) => {
                res.unshift({ key: value, label: value })
            })
        }

        // Finally we show the input value if custom values are allowed and it's not in the list
        if (allowCustomValues && inputValue && !values.includes(inputValue)) {
            res.unshift({ key: inputValue, label: inputValue })
        }

        return res
    }, [options, inputValue, value])

    // Reset the selected index when the visible options change
    useEffect(() => {
        setSelectedIndex(0)
    }, [visibleOptions.length])

    const setInputValue = (newValue: string): void => {
        _setInputValue(newValue)
        onInputChange?.(inputValue)
    }

    const _onActionItem = (item: string): void => {
        let newValues = [...values]
        if (values.includes(item)) {
            // Remove the item
            if (mode === 'single') {
                newValues = []
            } else {
                newValues.splice(values.indexOf(item), 1)
            }
        } else {
            // Add the item
            if (mode === 'single') {
                newValues = [item]
            } else {
                newValues.push(item)
            }

            setInputValue('')
        }

        onChange?.(newValues)
    }

    const _onBlur = (): void => {
        // We need to add a delay as a click could be in the popover or the input wrapper which refocuses
        setTimeout(() => {
            if (popoverFocusRef.current) {
                popoverFocusRef.current = false
                inputRef.current?.focus()
                _onFocus()
                return
            }
            if (allowCustomValues && inputValue.trim() && !values.includes(inputValue)) {
                _onActionItem(inputValue.trim())
            } else {
                setInputValue('')
            }
            setShowPopover(false)
        }, 100)
    }

    const _onFocus = (): void => {
        setShowPopover(true)
        popoverFocusRef.current = true
    }

    const _onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'Enter') {
            e.preventDefault()

            const itemToAdd = visibleOptions[selectedIndex]?.key
            if (itemToAdd) {
                _onActionItem(visibleOptions[selectedIndex]?.key)
            }
        } else if (e.key === 'Backspace') {
            if (!inputValue) {
                e.preventDefault()
                const newValues = [...values]
                newValues.pop()
                onChange?.(newValues)
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex(Math.min(selectedIndex + 1, options.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex(Math.max(selectedIndex - 1, 0))
        }
    }

    // TRICKY: We don't want the popover to affect the snack buttons
    const prefix = (
        <PopoverReferenceContext.Provider value={null}>
            <>
                {values.map((value) => {
                    const option = options.find((option) => option.key === value) ?? {
                        label: value,
                        labelComponent: null,
                    }
                    return (
                        <>
                            <LemonSnack title={option?.label} onClose={() => _onActionItem(value)}>
                                {option?.labelComponent ?? option?.label}
                            </LemonSnack>
                        </>
                    )
                })}
            </>
        </PopoverReferenceContext.Provider>
    )

    return (
        <LemonDropdown
            sameWidth
            closeOnClickInside={false}
            {...dropdownProps}
            visible={showPopover}
            actionable
            onClickOutside={() => {
                popoverFocusRef.current = false
                setShowPopover(false)
            }}
            onClickInside={(e) => {
                popoverFocusRef.current = true
                e.stopPropagation()
            }}
            overlay={
                <div className="space-y-px overflow-y-auto">
                    {visibleOptions.length ? (
                        visibleOptions?.map((option, index) => {
                            const isHighlighted = index === selectedIndex
                            return (
                                <LemonButton
                                    key={option.key}
                                    type="tertiary"
                                    size="small"
                                    fullWidth
                                    active={isHighlighted || values.includes(option.key)}
                                    onClick={() => _onActionItem(option.key)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <span className="flex-1 flex items-center justify-between gap-1">
                                        {option.labelComponent ?? option.label}
                                        {isHighlighted ? (
                                            <span>
                                                <KeyboardShortcut enter />{' '}
                                                {!values.includes(option.key)
                                                    ? mode === 'single'
                                                        ? 'select'
                                                        : 'add'
                                                    : mode === 'single'
                                                    ? 'unselect'
                                                    : 'remove'}
                                            </span>
                                        ) : undefined}
                                    </span>
                                </LemonButton>
                            )
                        })
                    ) : loading ? (
                        <>
                            {range(5).map((x) => (
                                <div key={x} className="flex gap-2 items-center h-10 px-1">
                                    <LemonSkeleton.Circle className="w-6 h-6" />
                                    <LemonSkeleton />
                                </div>
                            ))}
                        </>
                    ) : (
                        <p className="text-muted italic p-1">
                            {allowCustomValues
                                ? 'Start typing and press Enter to add options'
                                : `No options matching "${inputValue}"`}
                        </p>
                    )}
                </div>
            }
        >
            <span className="LemonInputSelect" {...props}>
                <LemonInput
                    ref={inputRef}
                    placeholder={!values.length ? placeholder : undefined}
                    prefix={prefix}
                    onFocus={_onFocus}
                    onBlur={_onBlur}
                    value={inputValue}
                    onChange={setInputValue}
                    onKeyDown={_onKeyDown}
                    disabled={disabled}
                />
            </span>
        </LemonDropdown>
    )
}
