import { RunStreamEvent, RunItem } from '@openai/agents';

/**
 * Base types used throughout the ChatKit SDK
 */
/**
 * Paginated collection of records returned from the API.
 */
interface Page<T> {
    data: T[];
    has_more: boolean;
    after: string | null;
}
/**
 * Model and tool configuration for message processing.
 */
interface InferenceOptions {
    tool_choice?: ToolChoice | null;
    model?: string | null;
}
/**
 * Explicit tool selection for the assistant to invoke.
 */
interface ToolChoice {
    id: string;
}
/**
 * Literal type for feedback sentiment.
 */
type FeedbackKind = 'positive' | 'negative';
/**
 * Literal names of supported progress icons.
 */
type IconName = 'analytics' | 'atom' | 'bolt' | 'book-open' | 'book-closed' | 'calendar' | 'chart' | 'circle-question' | 'compass' | 'cube' | 'globe' | 'keys' | 'lab' | 'images' | 'lifesaver' | 'lightbulb' | 'map-pin' | 'name' | 'notebook' | 'notebook-pencil' | 'page-blank' | 'profile' | 'profile-card' | 'search' | 'sparkle' | 'sparkle-double' | 'square-code' | 'square-image' | 'square-text' | 'suitcase' | 'write' | 'write-alt' | 'write-alt2';

/**
 * Attachment types - files and images attached to messages
 */
/**
 * Base metadata shared by all attachments.
 */
interface AttachmentBase {
    id: string;
    name: string;
    mime_type: string;
    /**
     * The URL to upload the file, used for two-phase upload.
     * Should be set to null after upload is complete or when using direct upload
     * where uploading happens when creating the attachment object.
     */
    upload_url?: string | null;
}
/**
 * Attachment representing a generic file.
 */
interface FileAttachment extends AttachmentBase {
    type: 'file';
}
/**
 * Attachment representing an image resource.
 */
interface ImageAttachment extends AttachmentBase {
    type: 'image';
    preview_url: string;
}
/**
 * Union of supported attachment types.
 */
type Attachment = FileAttachment | ImageAttachment;
/**
 * Metadata needed to initialize an attachment.
 */
interface AttachmentCreateParams {
    name: string;
    size: number;
    mime_type: string;
}
/**
 * Type guard for FileAttachment.
 */
declare function isFileAttachment(attachment: Attachment): attachment is FileAttachment;
/**
 * Type guard for ImageAttachment.
 */
declare function isImageAttachment(attachment: Attachment): attachment is ImageAttachment;

/**
 * Source types - references to files, URLs, and entities
 */
/**
 * Base class for sources displayed to users.
 */
interface SourceBase {
    title: string;
    description?: string | null;
    timestamp?: string | null;
    group?: string | null;
}
/**
 * Source metadata for file-based references.
 */
interface FileSource extends SourceBase {
    type: 'file';
    filename: string;
}
/**
 * Source metadata for external URLs.
 */
interface URLSource extends SourceBase {
    type: 'url';
    url: string;
    attribution?: string | null;
}
/**
 * Source metadata for entity references.
 */
interface EntitySource extends SourceBase {
    type: 'entity';
    id: string;
    icon?: string | null;
    preview?: 'lazy' | null;
}
/**
 * Union of supported source types.
 */
type Source = URLSource | FileSource | EntitySource;
/**
 * Type guard for URLSource.
 */
declare function isURLSource(source: Source): source is URLSource;
/**
 * Type guard for FileSource.
 */
declare function isFileSource(source: Source): source is FileSource;
/**
 * Type guard for EntitySource.
 */
declare function isEntitySource(source: Source): source is EntitySource;

/**
 * Action types - interactive behaviors for widgets
 */
type Handler = 'client' | 'server';
type LoadingBehavior = 'auto' | 'none' | 'self' | 'container';
/**
 * Configuration for an action that can be triggered by a widget component.
 */
interface ActionConfig {
    type: string;
    payload?: unknown;
    handler?: Handler;
    loadingBehavior?: LoadingBehavior;
}
/**
 * Action - represents an interactive action from a widget
 * (Full implementation in Phase 6; for now just an alias to ActionConfig)
 */
type Action = ActionConfig;

/**
 * Common types and utilities for ChatKit widgets.
 *
 * These types are shared across widget components and match the Python SDK.
 */

/**
 * Color values for light and dark themes.
 */
interface ThemeColor {
    /** Color to use when the theme is dark. */
    dark: string;
    /** Color to use when the theme is light. */
    light: string;
}
/**
 * Shorthand spacing values applied to a widget.
 */
interface Spacing {
    /** Top spacing; accepts a spacing unit or CSS string. */
    top?: number | string;
    /** Right spacing; accepts a spacing unit or CSS string. */
    right?: number | string;
    /** Bottom spacing; accepts a spacing unit or CSS string. */
    bottom?: number | string;
    /** Left spacing; accepts a spacing unit or CSS string. */
    left?: number | string;
    /** Horizontal spacing; accepts a spacing unit or CSS string. */
    x?: number | string;
    /** Vertical spacing; accepts a spacing unit or CSS string. */
    y?: number | string;
}
/**
 * Border style definition for an edge.
 */
interface Border {
    /** Thickness of the border in px. */
    size: number;
    /**
     * Border color; accepts border color token, a primitive color token, a CSS string, or theme-aware `{ light, dark }`.
     *
     * Valid tokens: `default` `subtle` `strong`
     *
     * Primitive color token: e.g. `red-100`, `blue-900`, `gray-500`
     */
    color?: string | ThemeColor;
    /** Border line style. */
    style?: 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset';
}
/**
 * Composite border configuration applied across edges.
 */
interface Borders {
    /** Top border or thickness in px. */
    top?: number | Border;
    /** Right border or thickness in px. */
    right?: number | Border;
    /** Bottom border or thickness in px. */
    bottom?: number | Border;
    /** Left border or thickness in px. */
    left?: number | Border;
    /** Horizontal borders or thickness in px. */
    x?: number | Border;
    /** Vertical borders or thickness in px. */
    y?: number | Border;
}
/**
 * Editable field options for text widgets.
 */
interface EditableProps {
    /** The name of the form control field used when submitting forms. */
    name: string;
    /** Autofocus the editable input when it appears. */
    autoFocus?: boolean;
    /** Select all text on focus. */
    autoSelect?: boolean;
    /** Native autocomplete hint for the input. */
    autoComplete?: string;
    /** Allow browser password/autofill extensions. */
    allowAutofillExtensions?: boolean;
    /** Regex pattern for input validation. */
    pattern?: string;
    /** Placeholder text for the editable input. */
    placeholder?: string;
    /** Mark the editable input as required. */
    required?: boolean;
}
/**
 * Widget status representation using a favicon.
 */
interface WidgetStatusWithFavicon {
    /** Status text to display. */
    text: string;
    /** URL of a favicon to render at the start of the status. */
    favicon?: string;
    /** Show a frame around the favicon for contrast. */
    frame?: boolean;
}
/**
 * Widget status representation using an icon.
 */
interface WidgetStatusWithIcon {
    /** Status text to display. */
    text: string;
    /** Icon to render at the start of the status. */
    icon?: WidgetIcon;
}
/**
 * Union for representing widget status messaging.
 */
type WidgetStatus = WidgetStatusWithFavicon | WidgetStatusWithIcon;
/**
 * Configuration for confirm/cancel actions within a card.
 */
interface CardAction {
    /** Button label shown in the card footer. */
    label: string;
    /** Declarative action dispatched to the host application. */
    action: ActionConfig;
}
/**
 * Selectable option used by the Select widget.
 */
interface SelectOption {
    /** Option value submitted with the form. */
    value: string;
    /** Human-readable label for the option. */
    label: string;
    /** Disable the option. */
    disabled?: boolean;
    /** Displayed as secondary text below the option label. */
    description?: string;
}
/**
 * Option inside a RadioGroup widget.
 */
interface RadioOption {
    /** Label displayed next to the radio option. */
    label: string;
    /** Value submitted when the radio option is selected. */
    value: string;
    /** Disables a specific radio option. */
    disabled?: boolean;
}
/** Allowed corner radius tokens. */
type RadiusValue = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full' | '100%' | 'none';
/** Horizontal text alignment options. */
type TextAlign = 'start' | 'center' | 'end';
/** Body text size tokens. */
type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
/** Icon size tokens. */
type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
/** Title text size tokens. */
type TitleSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
/** Caption text size tokens. */
type CaptionSize = 'sm' | 'md' | 'lg';
/** Flexbox alignment options. */
type Alignment = 'start' | 'center' | 'end' | 'baseline' | 'stretch';
/** Flexbox justification options. */
type Justification = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly' | 'stretch';
/** Button and input style variants. */
type ControlVariant = 'solid' | 'soft' | 'outline' | 'ghost';
/** Button and input size variants. */
type ControlSize = '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
/**
 * Icon names accepted by widgets that render icons.
 */
type WidgetIcon = 'agent' | 'analytics' | 'atom' | 'bolt' | 'book-open' | 'book-clock' | 'book-closed' | 'calendar' | 'chart' | 'check' | 'check-circle' | 'check-circle-filled' | 'chevron-left' | 'chevron-right' | 'circle-question' | 'compass' | 'confetti' | 'cube' | 'desktop' | 'document' | 'dot' | 'dots-horizontal' | 'dots-vertical' | 'empty-circle' | 'external-link' | 'globe' | 'keys' | 'lab' | 'images' | 'info' | 'lifesaver' | 'lightbulb' | 'mail' | 'map-pin' | 'maps' | 'mobile' | 'name' | 'notebook' | 'notebook-pencil' | 'page-blank' | 'phone' | 'play' | 'plus' | 'profile' | 'profile-card' | 'reload' | 'star' | 'star-filled' | 'search' | 'sparkle' | 'sparkle-double' | 'square-code' | 'square-image' | 'square-text' | 'suitcase' | 'settings-slider' | 'user' | 'wreath' | 'write' | 'write-alt' | 'write-alt2';
/**
 * Base properties for all ChatKit widget components.
 */
interface WidgetComponentBase {
    /** Unique identifier for the widget. */
    id?: string | null;
    /** React key for the widget. */
    key?: string | null;
    /** Widget type discriminator. */
    type: string;
}
/**
 * Shared layout props for flexible container widgets.
 */
interface BoxBase extends WidgetComponentBase {
    /** Child components to render inside the container. */
    children?: WidgetComponent$3[] | null;
    /** Cross-axis alignment of children. */
    align?: Alignment | null;
    /** Main-axis distribution of children. */
    justify?: Justification | null;
    /** Wrap behavior for flex items. */
    wrap?: 'nowrap' | 'wrap' | 'wrap-reverse' | null;
    /** Flex growth/shrink factor. */
    flex?: number | string | null;
    /** Gap between direct children; spacing unit or CSS string. */
    gap?: number | string | null;
    /** Explicit height; px or CSS string. */
    height?: number | string | null;
    /** Explicit width; px or CSS string. */
    width?: number | string | null;
    /** Shorthand to set both width and height; px or CSS string. */
    size?: number | string | null;
    /** Minimum height; px or CSS string. */
    minHeight?: number | string | null;
    /** Minimum width; px or CSS string. */
    minWidth?: number | string | null;
    /** Shorthand to set both minWidth and minHeight; px or CSS string. */
    minSize?: number | string | null;
    /** Maximum height; px or CSS string. */
    maxHeight?: number | string | null;
    /** Maximum width; px or CSS string. */
    maxWidth?: number | string | null;
    /** Shorthand to set both maxWidth and maxHeight; px or CSS string. */
    maxSize?: number | string | null;
    /** Inner padding; spacing unit, CSS string, or padding object. */
    padding?: number | string | Spacing | null;
    /** Outer margin; spacing unit, CSS string, or margin object. */
    margin?: number | string | Spacing | null;
    /** Border applied to the container; px or border object/shorthand. */
    border?: number | Border | Borders | null;
    /** Border radius; accepts a radius token. */
    radius?: RadiusValue | null;
    /**
     * Background color; accepts background color token, a primitive color token, a CSS string, or theme-aware `{ light, dark }`.
     *
     * Valid tokens: `surface` `surface-secondary` `surface-tertiary` `surface-elevated` `surface-elevated-secondary`
     *
     * Primitive color token: e.g. `red-100`, `blue-900`, `gray-500`
     */
    background?: string | ThemeColor | null;
    /** Aspect ratio of the box (e.g., 16/9); number or CSS string. */
    aspectRatio?: number | string | null;
}
type WidgetComponent$3 = any;

/**
 * Content widgets for ChatKit.
 *
 * These widgets display text, images, and other content.
 */

/**
 * Widget rendering plain text with typography controls.
 */
interface Text extends WidgetComponentBase {
    type: 'Text';
    /** Text content to display. */
    value: string;
    /** Enables streaming-friendly transitions for incremental updates. */
    streaming?: boolean | null;
    /** Render text in italic style. */
    italic?: boolean | null;
    /** Render text with a line-through decoration. */
    lineThrough?: boolean | null;
    /**
     * Text color; accepts a text color token, a primitive color token, a CSS color string, or a theme-aware `{ light, dark }`.
     *
     * Text color tokens: `prose` `primary` `emphasis` `secondary` `tertiary` `success` `warning` `danger`
     *
     * Primitive color token: e.g. `red-100`, `blue-900`, `gray-500`
     */
    color?: string | ThemeColor | null;
    /** Font weight; accepts a font weight token. */
    weight?: 'normal' | 'medium' | 'semibold' | 'bold' | null;
    /** Constrain the text container width; px or CSS string. */
    width?: number | string | null;
    /** Size of the text; accepts a text size token. */
    size?: TextSize | null;
    /** Horizontal text alignment. */
    textAlign?: TextAlign | null;
    /** Truncate overflow with ellipsis. */
    truncate?: boolean | null;
    /** Reserve space for a minimum number of lines. */
    minLines?: number | null;
    /** Limit text to a maximum number of lines (line clamp). */
    maxLines?: number | null;
    /** Enable inline editing for this text node. */
    editable?: false | EditableProps | null;
}
/**
 * Widget rendering prominent headline text.
 */
interface Title extends WidgetComponentBase {
    type: 'Title';
    /** Text content to display. */
    value: string;
    /**
     * Text color; accepts a text color token, a primitive color token, a CSS color string, or a theme-aware `{ light, dark }`.
     *
     * Text color tokens: `prose` `primary` `emphasis` `secondary` `tertiary` `success` `warning` `danger`
     *
     * Primitive color token: e.g. `red-100`, `blue-900`, `gray-500`
     */
    color?: string | ThemeColor | null;
    /** Font weight; accepts a font weight token. */
    weight?: 'normal' | 'medium' | 'semibold' | 'bold' | null;
    /** Size of the title text; accepts a title size token. */
    size?: TitleSize | null;
    /** Horizontal text alignment. */
    textAlign?: TextAlign | null;
    /** Truncate overflow with ellipsis. */
    truncate?: boolean | null;
    /** Limit text to a maximum number of lines (line clamp). */
    maxLines?: number | null;
}
/**
 * Widget rendering supporting caption text.
 */
interface Caption extends WidgetComponentBase {
    type: 'Caption';
    /** Text content to display. */
    value: string;
    /**
     * Text color; accepts a text color token, a primitive color token, a CSS color string, or a theme-aware `{ light, dark }`.
     *
     * Text color tokens: `prose` `primary` `emphasis` `secondary` `tertiary` `success` `warning` `danger`
     *
     * Primitive color token: e.g. `red-100`, `blue-900`, `gray-500`
     */
    color?: string | ThemeColor | null;
    /** Font weight; accepts a font weight token. */
    weight?: 'normal' | 'medium' | 'semibold' | 'bold' | null;
    /** Size of the caption text; accepts a caption size token. */
    size?: CaptionSize | null;
    /** Horizontal text alignment. */
    textAlign?: TextAlign | null;
    /** Truncate overflow with ellipsis. */
    truncate?: boolean | null;
    /** Limit text to a maximum number of lines (line clamp). */
    maxLines?: number | null;
}
/**
 * Widget rendering Markdown content, optionally streamed.
 */
interface Markdown extends WidgetComponentBase {
    type: 'Markdown';
    /** Markdown source string to render. */
    value: string;
    /** Applies streaming-friendly transitions for incremental updates. */
    streaming?: boolean | null;
}
/**
 * Small badge indicating status or categorization.
 */
interface Badge extends WidgetComponentBase {
    type: 'Badge';
    /** Text to display inside the badge. */
    label: string;
    /** Color of the badge; accepts a badge color token. */
    color?: 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'discovery' | null;
    /** Visual style of the badge. */
    variant?: 'solid' | 'soft' | 'outline' | null;
    /** Size of the badge. */
    size?: 'sm' | 'md' | 'lg' | null;
    /** Determines if the badge should be fully rounded (pill). */
    pill?: boolean | null;
}
/**
 * Icon component referencing a built-in icon name.
 */
interface Icon extends WidgetComponentBase {
    type: 'Icon';
    /** Name of the icon to display. */
    name: WidgetIcon;
    /**
     * Icon color; accepts a text color token, a primitive color token, a CSS color string, or a theme-aware `{ light, dark }`.
     *
     * Text color tokens: `prose` `primary` `emphasis` `secondary` `tertiary` `success` `warning` `danger`
     *
     * Primitive color token: e.g. `red-100`, `blue-900`, `gray-500`
     */
    color?: string | ThemeColor | null;
    /** Size of the icon; accepts an icon size token. */
    size?: IconSize | null;
}
/**
 * Image component with sizing and fitting controls.
 */
interface Image extends WidgetComponentBase {
    type: 'Image';
    /** Image URL source. */
    src: string;
    /** Alternate text for accessibility. */
    alt?: string | null;
    /** How the image should fit within the container. */
    fit?: 'cover' | 'contain' | 'fill' | 'scale-down' | 'none' | null;
    /** Focal position of the image within the container. */
    position?: 'top left' | 'top' | 'top right' | 'left' | 'center' | 'right' | 'bottom left' | 'bottom' | 'bottom right' | null;
    /** Border radius; accepts a radius token. */
    radius?: RadiusValue | null;
    /** Draw a subtle frame around the image. */
    frame?: boolean | null;
    /** Flush the image to the container edge, removing surrounding padding. */
    flush?: boolean | null;
    /** Explicit height; px or CSS string. */
    height?: number | string | null;
    /** Explicit width; px or CSS string. */
    width?: number | string | null;
    /** Shorthand to set both width and height; px or CSS string. */
    size?: number | string | null;
    /** Minimum height; px or CSS string. */
    minHeight?: number | string | null;
    /** Minimum width; px or CSS string. */
    minWidth?: number | string | null;
    /** Shorthand to set both minWidth and minHeight; px or CSS string. */
    minSize?: number | string | null;
    /** Maximum height; px or CSS string. */
    maxHeight?: number | string | null;
    /** Maximum width; px or CSS string. */
    maxWidth?: number | string | null;
    /** Shorthand to set both maxWidth and maxHeight; px or CSS string. */
    maxSize?: number | string | null;
    /** Outer margin; spacing unit, CSS string, or margin object. */
    margin?: number | string | Spacing | null;
    /**
     * Background color; accepts background color token, a primitive color token, a CSS string, or theme-aware `{ light, dark }`.
     *
     * Valid tokens: `surface` `surface-secondary` `surface-tertiary` `surface-elevated` `surface-elevated-secondary`
     *
     * Primitive color token: e.g. `red-100`, `blue-900`, `gray-500`
     */
    background?: string | ThemeColor | null;
    /** Aspect ratio of the box (e.g., 16/9); number or CSS string. */
    aspectRatio?: number | string | null;
    /** Flex growth/shrink factor. */
    flex?: number | string | null;
}

/**
 * Layout widgets for ChatKit.
 *
 * These widgets provide structure and organization for content.
 */

type WidgetComponent$2 = any;
/**
 * Versatile container used for structuring widget content.
 */
interface Card extends WidgetComponentBase {
    type: 'Card';
    /** Treat the card as an HTML form so confirm/cancel capture form data. */
    asForm?: boolean | null;
    /** Child components rendered inside the card. */
    children: WidgetComponent$2[];
    /**
     * Background color; accepts background color token, a primitive color token, a CSS string, or theme-aware `{ light, dark }`.
     *
     * Valid tokens: `surface` `surface-secondary` `surface-tertiary` `surface-elevated` `surface-elevated-secondary`
     *
     * Primitive color token: e.g. `red-100`, `blue-900`, `gray-500`
     */
    background?: string | ThemeColor | null;
    /** Visual size of the card; accepts a size token. No preset default is documented. */
    size?: 'sm' | 'md' | 'lg' | 'full' | null;
    /** Inner spacing of the card; spacing unit, CSS string, or padding object. */
    padding?: number | string | Spacing | null;
    /** Optional status header displayed above the card. */
    status?: WidgetStatus | null;
    /** Collapse card body after the main action has completed. */
    collapsed?: boolean | null;
    /** Confirmation action button shown in the card footer. */
    confirm?: CardAction | null;
    /** Cancel action button shown in the card footer. */
    cancel?: CardAction | null;
    /** Force light or dark theme for this subtree. */
    theme?: 'light' | 'dark' | null;
}
/**
 * Generic flex container with direction control.
 */
interface Box extends BoxBase {
    type: 'Box';
    /** Flex direction for content within this container. */
    direction?: 'row' | 'col' | null;
}
/**
 * Horizontal flex container.
 */
interface Row extends BoxBase {
    type: 'Row';
}
/**
 * Vertical flex container.
 */
interface Col extends BoxBase {
    type: 'Col';
}
/**
 * Form wrapper capable of submitting onSubmitAction.
 */
interface Form extends BoxBase {
    type: 'Form';
    /** Action dispatched when the form is submitted. */
    onSubmitAction?: ActionConfig | null;
    /** Flex direction for laying out form children. */
    direction?: 'row' | 'col' | null;
}
/**
 * Visual divider separating content sections.
 */
interface Divider extends WidgetComponentBase {
    type: 'Divider';
    /**
     * Divider color; accepts border color token, a primitive color token, a CSS string, or theme-aware `{ light, dark }`.
     *
     * Valid tokens: `default` `subtle` `strong`
     *
     * Primitive color token: e.g. `red-100`, `blue-900`, `gray-500`
     */
    color?: string | ThemeColor | null;
    /** Thickness of the divider line; px or CSS string. */
    size?: number | string | null;
    /** Outer spacing above and below the divider; spacing unit or CSS string. */
    spacing?: number | string | null;
    /** Flush the divider to the container edge, removing surrounding padding. */
    flush?: boolean | null;
}
/**
 * Flexible spacer used to push content apart.
 */
interface Spacer extends WidgetComponentBase {
    type: 'Spacer';
    /** Minimum size the spacer should occupy along the flex direction. */
    minSize?: number | string | null;
}
/**
 * Single row inside a ListView component.
 */
interface ListViewItem extends WidgetComponentBase {
    type: 'ListViewItem';
    /** Content for the list item. */
    children: WidgetComponent$2[];
    /** Optional action triggered when the list item is clicked. */
    onClickAction?: ActionConfig | null;
    /** Gap between children within the list item; spacing unit or CSS string. */
    gap?: number | string | null;
    /** Y-axis alignment for content within the list item. */
    align?: Alignment | null;
}
/**
 * Container component for rendering collections of list items.
 */
interface ListView extends WidgetComponentBase {
    type: 'ListView';
    /** Items to render in the list. */
    children: ListViewItem[];
    /** Max number of items to show before a "Show more" control. */
    limit?: number | 'auto' | null;
    /** Optional status header displayed above the list. */
    status?: WidgetStatus | null;
    /** Force light or dark theme for this subtree. */
    theme?: 'light' | 'dark' | null;
}

/**
 * Interactive widgets for ChatKit.
 *
 * These widgets handle user interactions.
 */

/**
 * Button component optionally wired to an action.
 */
interface Button extends WidgetComponentBase {
    type: 'Button';
    /** Configure the button as a submit button for the nearest form. */
    submit?: boolean | null;
    /** Text to display inside the button. */
    label?: string | null;
    /** Action dispatched on click. */
    onClickAction?: ActionConfig | null;
    /** Icon shown before the label; can be used for icon-only buttons. */
    iconStart?: WidgetIcon | null;
    /** Optional icon shown after the label. */
    iconEnd?: WidgetIcon | null;
    /** Convenience preset for button style. */
    style?: 'primary' | 'secondary' | null;
    /** Controls the size of icons within the button; accepts an icon size token. */
    iconSize?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | null;
    /** Color of the button; accepts a button color token. */
    color?: 'primary' | 'secondary' | 'info' | 'discovery' | 'success' | 'caution' | 'warning' | 'danger' | null;
    /** Visual variant of the button; accepts a control variant token. */
    variant?: ControlVariant | null;
    /** Controls the overall size of the button. */
    size?: ControlSize | null;
    /** Determines if the button should be fully rounded (pill). */
    pill?: boolean | null;
    /** Determines if the button should have matching width and height. */
    uniform?: boolean | null;
    /** Extend the button to 100% of the available width. */
    block?: boolean | null;
    /** Disable interactions and apply disabled styles. */
    disabled?: boolean | null;
}

/**
 * Form widgets for ChatKit.
 *
 * These widgets handle user input and form submissions.
 */

/**
 * Single-line text input component.
 */
interface Input extends WidgetComponentBase {
    type: 'Input';
    /** The name of the form control field used when submitting forms. */
    name: string;
    /** Native input type. */
    inputType?: 'number' | 'email' | 'text' | 'password' | 'tel' | 'url' | null;
    /** Initial value of the input. */
    defaultValue?: string | null;
    /** Mark the input as required for form submission. */
    required?: boolean | null;
    /** Regex pattern for input validation. */
    pattern?: string | null;
    /** Placeholder text shown when empty. */
    placeholder?: string | null;
    /** Allow password managers / autofill extensions to appear. */
    allowAutofillExtensions?: boolean | null;
    /** Select all contents of the input when it mounts. */
    autoSelect?: boolean | null;
    /** Autofocus the input when it mounts. */
    autoFocus?: boolean | null;
    /** Disable interactions and apply disabled styles. */
    disabled?: boolean | null;
    /** Visual style of the input. */
    variant?: 'soft' | 'outline' | null;
    /** Controls the size of the input control. */
    size?: ControlSize | null;
    /** Controls gutter on the edges of the input; overrides value from `size`. */
    gutterSize?: '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | null;
    /** Determines if the input should be fully rounded (pill). */
    pill?: boolean | null;
}
/**
 * Multiline text input component.
 */
interface Textarea extends WidgetComponentBase {
    type: 'Textarea';
    /** The name of the form control field used when submitting forms. */
    name: string;
    /** Initial value of the textarea. */
    defaultValue?: string | null;
    /** Mark the textarea as required for form submission. */
    required?: boolean | null;
    /** Regex pattern for input validation. */
    pattern?: string | null;
    /** Placeholder text shown when empty. */
    placeholder?: string | null;
    /** Select all contents of the textarea when it mounts. */
    autoSelect?: boolean | null;
    /** Autofocus the textarea when it mounts. */
    autoFocus?: boolean | null;
    /** Disable interactions and apply disabled styles. */
    disabled?: boolean | null;
    /** Visual style of the textarea. */
    variant?: 'soft' | 'outline' | null;
    /** Controls the size of the textarea control. */
    size?: ControlSize | null;
    /** Controls gutter on the edges of the textarea; overrides value from `size`. */
    gutterSize?: '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | null;
    /** Initial number of visible rows. */
    rows?: number | null;
    /** Automatically grow/shrink to fit content. */
    autoResize?: boolean | null;
    /** Maximum number of rows when auto-resizing. */
    maxRows?: number | null;
    /** Allow password managers / autofill extensions to appear. */
    allowAutofillExtensions?: boolean | null;
}
/**
 * Select dropdown component.
 */
interface Select extends WidgetComponentBase {
    type: 'Select';
    /** The name of the form control field used when submitting forms. */
    name: string;
    /** List of selectable options. */
    options: SelectOption[];
    /** Action dispatched when the value changes. */
    onChangeAction?: ActionConfig | null;
    /** Placeholder text shown when no value is selected. */
    placeholder?: string | null;
    /** Initial value of the select. */
    defaultValue?: string | null;
    /** Visual style of the select; accepts a control variant token. */
    variant?: ControlVariant | null;
    /** Controls the size of the select control. */
    size?: ControlSize | null;
    /** Determines if the select should be fully rounded (pill). */
    pill?: boolean | null;
    /** Extend the select to 100% of the available width. */
    block?: boolean | null;
    /** Show a clear control to unset the value. */
    clearable?: boolean | null;
    /** Disable interactions and apply disabled styles. */
    disabled?: boolean | null;
}
/**
 * Checkbox input component.
 */
interface Checkbox extends WidgetComponentBase {
    type: 'Checkbox';
    /** The name of the form control field used when submitting forms. */
    name: string;
    /** Optional label text rendered next to the checkbox. */
    label?: string | null;
    /** The initial checked state of the checkbox. */
    defaultChecked?: string | null;
    /** Action dispatched when the checked state changes. */
    onChangeAction?: ActionConfig | null;
    /** Disable interactions and apply disabled styles. */
    disabled?: boolean | null;
    /** Mark the checkbox as required for form submission. */
    required?: boolean | null;
}
/**
 * Grouped radio input control.
 */
interface RadioGroup extends WidgetComponentBase {
    type: 'RadioGroup';
    /** The name of the form control field used when submitting forms. */
    name: string;
    /** Array of options to render as radio items. */
    options?: RadioOption[] | null;
    /** Accessible label for the radio group; falls back to `name`. */
    ariaLabel?: string | null;
    /** Action dispatched when the selected value changes. */
    onChangeAction?: ActionConfig | null;
    /** Initial selected value of the radio group. */
    defaultValue?: string | null;
    /** Layout direction of the radio items. */
    direction?: 'row' | 'col' | null;
    /** Disable interactions and apply disabled styles for the entire group. */
    disabled?: boolean | null;
    /** Mark the group as required for form submission. */
    required?: boolean | null;
}
/**
 * Form label associated with a field.
 */
interface Label extends WidgetComponentBase {
    type: 'Label';
    /** Text content of the label. */
    value: string;
    /** Name of the field this label describes. */
    fieldName: string;
    /** Size of the label text; accepts a text size token. */
    size?: TextSize | null;
    /** Font weight; accepts a font weight token. */
    weight?: 'normal' | 'medium' | 'semibold' | 'bold' | null;
    /** Horizontal text alignment. */
    textAlign?: TextAlign | null;
    /**
     * Text color; accepts a text color token, a primitive color token, a CSS color string, or a theme-aware `{ light, dark }`.
     *
     * Text color tokens: `prose` `primary` `emphasis` `secondary` `tertiary` `success` `warning` `danger`
     *
     * Primitive color token: e.g. `red-100`, `blue-900`, `gray-500`
     */
    color?: string | ThemeColor | null;
}
/**
 * Date picker input component.
 */
interface DatePicker extends WidgetComponentBase {
    type: 'DatePicker';
    /** The name of the form control field used when submitting forms. */
    name: string;
    /** Action dispatched when the date value changes. */
    onChangeAction?: ActionConfig | null;
    /** Placeholder text shown when no date is selected. */
    placeholder?: string | null;
    /** Initial value of the date picker. */
    defaultValue?: string | null;
    /** Earliest selectable date (inclusive). */
    min?: string | null;
    /** Latest selectable date (inclusive). */
    max?: string | null;
    /** Visual variant of the datepicker control. */
    variant?: ControlVariant | null;
    /** Controls the size of the datepicker control. */
    size?: ControlSize | null;
    /** Preferred side to render the calendar. */
    side?: 'top' | 'bottom' | 'left' | 'right' | null;
    /** Preferred alignment of the calendar relative to the control. */
    align?: 'start' | 'center' | 'end' | null;
    /** Determines if the datepicker should be fully rounded (pill). */
    pill?: boolean | null;
    /** Extend the datepicker to 100% of the available width. */
    block?: boolean | null;
    /** Show a clear control to unset the value. */
    clearable?: boolean | null;
    /** Disable interactions and apply disabled styles. */
    disabled?: boolean | null;
}

/**
 * Advanced widgets for ChatKit.
 *
 * These widgets provide complex functionality like charts and transitions.
 */

type WidgetComponent$1 = any;
/**
 * Interpolation curve types for area and line series.
 */
type CurveType = 'basis' | 'basisClosed' | 'basisOpen' | 'bumpX' | 'bumpY' | 'bump' | 'linear' | 'linearClosed' | 'natural' | 'monotoneX' | 'monotoneY' | 'monotone' | 'step' | 'stepBefore' | 'stepAfter';
/**
 * Configuration object for the X axis.
 */
interface XAxisConfig {
    /** Field name from each data row to use for X-axis categories. */
    dataKey: string;
    /** Hide the X axis line, ticks, and labels when true. */
    hide?: boolean;
    /** Custom mapping of tick values to display labels. */
    labels?: Record<string, string>;
}
/**
 * A bar series plotted from a numeric dataKey. Supports stacking.
 */
interface BarSeries {
    type: 'bar';
    /** Legend label for the series. */
    label?: string | null;
    /** Field name from each data row that contains the numeric value. */
    dataKey: string;
    /** Optional stack group ID. Series with the same ID stack together. */
    stack?: string | null;
    /**
     * Color for the series; accepts chart color token, a primitive color token, a CSS string, or theme-aware { light, dark }.
     *
     * Chart color tokens: `blue` `purple` `orange` `green` `red` `yellow` `pink`
     *
     * Primitive color token, e.g., `red-100`, `blue-900`, `gray-500`
     *
     * Note: By default, a color will be sequentially assigned from the chart series colors.
     */
    color?: string | ThemeColor | null;
}
/**
 * An area series plotted from a numeric dataKey. Supports stacking and curves.
 */
interface AreaSeries {
    type: 'area';
    /** Legend label for the series. */
    label?: string | null;
    /** Field name from each data row that contains the numeric value. */
    dataKey: string;
    /** Optional stack group ID. Series with the same ID stack together. */
    stack?: string | null;
    /**
     * Color for the series; accepts chart color token, a primitive color token, a CSS string, or theme-aware { light, dark }.
     *
     * Chart color tokens: `blue` `purple` `orange` `green` `red` `yellow` `pink`
     *
     * Primitive color token, e.g., `red-100`, `blue-900`, `gray-500`
     *
     * Note: By default, a color will be sequentially assigned from the chart series colors.
     */
    color?: string | ThemeColor | null;
    /** Interpolation curve type used to connect points. */
    curveType?: CurveType | null;
}
/**
 * A line series plotted from a numeric dataKey. Supports curves.
 */
interface LineSeries {
    type: 'line';
    /** Legend label for the series. */
    label?: string | null;
    /** Field name from each data row that contains the numeric value. */
    dataKey: string;
    /**
     * Color for the series; accepts chart color token, a primitive color token, a CSS string, or theme-aware { light, dark }.
     *
     * Chart color tokens: `blue` `purple` `orange` `green` `red` `yellow` `pink`
     *
     * Primitive color token, e.g., `red-100`, `blue-900`, `gray-500`
     *
     * Note: By default, a color will be sequentially assigned from the chart series colors.
     */
    color?: string | ThemeColor | null;
    /** Interpolation curve type used to connect points. */
    curveType?: CurveType | null;
}
/**
 * Union of all supported chart series types.
 */
type Series = BarSeries | AreaSeries | LineSeries;
/**
 * Data visualization component for simple bar/line/area charts.
 */
interface Chart extends WidgetComponentBase {
    type: 'Chart';
    /** Tabular data for the chart, where each row maps field names to values. */
    data: Array<Record<string, string | number>>;
    /** One or more series definitions that describe how to visualize data fields. */
    series: Series[];
    /** X-axis configuration; either a dataKey string or a config object. */
    xAxis: string | XAxisConfig;
    /** Controls whether the Y axis is rendered. */
    showYAxis?: boolean | null;
    /** Controls whether a legend is rendered. */
    showLegend?: boolean | null;
    /** Controls whether a tooltip is rendered when hovering over a datapoint. */
    showTooltip?: boolean | null;
    /** Gap between bars within the same category (in px). */
    barGap?: number | null;
    /** Gap between bar categories/groups (in px). */
    barCategoryGap?: number | null;
    /** Flex growth/shrink factor for layout. */
    flex?: number | string | null;
    /** Explicit height; px or CSS string. */
    height?: number | string | null;
    /** Explicit width; px or CSS string. */
    width?: number | string | null;
    /** Shorthand to set both width and height; px or CSS string. */
    size?: number | string | null;
    /** Minimum height; px or CSS string. */
    minHeight?: number | string | null;
    /** Minimum width; px or CSS string. */
    minWidth?: number | string | null;
    /** Shorthand to set both minWidth and minHeight; px or CSS string. */
    minSize?: number | string | null;
    /** Maximum height; px or CSS string. */
    maxHeight?: number | string | null;
    /** Maximum width; px or CSS string. */
    maxWidth?: number | string | null;
    /** Shorthand to set both maxWidth and maxHeight; px or CSS string. */
    maxSize?: number | string | null;
    /** Aspect ratio of the chart area (e.g., 16/9); number or CSS string. */
    aspectRatio?: number | string | null;
}
/**
 * Wrapper enabling transitions for a child component.
 */
interface Transition extends WidgetComponentBase {
    type: 'Transition';
    /** The child component to animate layout changes for. */
    children?: WidgetComponent$1 | null;
}

/**
 * ChatKit Widget System
 *
 * This module provides TypeScript type definitions for all ChatKit widgets.
 * Widgets are JSON structures that describe UI components rendered by the ChatKit frontend.
 *
 * The backend creates widget descriptions, and the ChatKit CDN bundle renders them.
 *
 * @example
 * ```typescript
 * import { Card, Text, Button } from './widgets';
 *
 * const widget: Card = {
 *   type: 'Card',
 *   children: [
 *     {
 *       type: 'Text',
 *       value: 'Hello, World!',
 *       size: 'lg'
 *     },
 *     {
 *       type: 'Button',
 *       label: 'Click me',
 *       variant: 'primary'
 *     }
 *   ]
 * };
 * ```
 */

/**
 * Union of all renderable widget components.
 *
 * This type represents any widget that can be used as a child in container widgets.
 */
type WidgetComponent = Text | Title | Caption | Markdown | Badge | Icon | Image | Box | Row | Col | Form | Divider | Spacer | ListViewItem | Button | Input | Textarea | Select | Checkbox | RadioGroup | Label | DatePicker | Chart | Transition;
/**
 * Union of valid root-level widget containers.
 *
 * These widgets can be used as the top-level widget in a WidgetItem.
 */
type WidgetRoot = Card | ListView;

/**
 * Workflow and task types
 */

/**
 * Base fields common to all workflow tasks.
 */
interface BaseTask {
    /**
     * Only used when rendering the task as part of a workflow.
     * Indicates the status of the task.
     */
    status_indicator?: 'none' | 'loading' | 'complete';
}
/**
 * Workflow task displaying custom content.
 */
interface CustomTask extends BaseTask {
    type: 'custom';
    title?: string | null;
    icon?: string | null;
    content?: string | null;
}
/**
 * Workflow task representing a web search.
 */
interface SearchTask extends BaseTask {
    type: 'web_search';
    title?: string | null;
    title_query?: string | null;
    queries: string[];
    sources: URLSource[];
}
/**
 * Workflow task capturing assistant reasoning.
 */
interface ThoughtTask extends BaseTask {
    type: 'thought';
    title?: string | null;
    content: string;
}
/**
 * Workflow task referencing file sources.
 */
interface FileTask extends BaseTask {
    type: 'file';
    title?: string | null;
    sources: FileSource[];
}
/**
 * Workflow task rendering image content.
 */
interface ImageTask extends BaseTask {
    type: 'image';
    title?: string | null;
}
/**
 * Union of workflow task variants.
 */
type Task = CustomTask | SearchTask | ThoughtTask | FileTask | ImageTask;
/**
 * Custom summary for a workflow.
 */
interface CustomSummary {
    title: string;
    icon?: string | null;
}
/**
 * Summary providing total workflow duration.
 */
interface DurationSummary {
    /**
     * The duration of the workflow in seconds
     */
    duration: number;
}
/**
 * Summary variants available for workflows.
 */
type WorkflowSummary = CustomSummary | DurationSummary;
/**
 * Workflow attached to a thread with optional summary.
 */
interface Workflow {
    type: 'custom' | 'reasoning';
    tasks: Task[];
    summary?: WorkflowSummary | null;
    expanded: boolean;
}
/**
 * Type guard for CustomTask.
 */
declare function isCustomTask(task: Task): task is CustomTask;
/**
 * Type guard for SearchTask.
 */
declare function isSearchTask(task: Task): task is SearchTask;
/**
 * Type guard for ThoughtTask.
 */
declare function isThoughtTask(task: Task): task is ThoughtTask;
/**
 * Type guard for FileTask.
 */
declare function isFileTask(task: Task): task is FileTask;
/**
 * Type guard for ImageTask.
 */
declare function isImageTask(task: Task): task is ImageTask;

/**
 * Thread item types - messages, widgets, tasks, etc.
 */

/**
 * Base fields shared by all thread items.
 */
interface ThreadItemBase {
    id: string;
    thread_id: string;
    created_at: string;
}
/**
 * User message content containing plaintext.
 */
interface UserMessageTextContent {
    type: 'input_text';
    text: string;
}
/**
 * User message content representing an interactive tag.
 */
interface UserMessageTagContent {
    type: 'input_tag';
    id: string;
    text: string;
    data: Record<string, unknown>;
    interactive: boolean;
}
/**
 * Union of allowed user message content payloads.
 */
type UserMessageContent = UserMessageTextContent | UserMessageTagContent;
/**
 * Payload describing a user message submission.
 */
interface UserMessageInput {
    content: UserMessageContent[];
    attachments: string[];
    quoted_text?: string | null;
    inference_options: InferenceOptions;
}
/**
 * Thread item representing a user message.
 */
interface UserMessageItem extends ThreadItemBase {
    type: 'user_message';
    content: UserMessageContent[];
    attachments: Attachment[];
    quoted_text?: string | null;
    inference_options: InferenceOptions;
}
/**
 * Reference to supporting context attached to assistant output.
 */
interface Annotation {
    type: 'annotation';
    source: Source;
    index?: number | null;
}
/**
 * Assistant message content consisting of text and annotations.
 */
interface AssistantMessageContent {
    type: 'output_text';
    text: string;
    annotations: Annotation[];
}
/**
 * Thread item representing an assistant message.
 */
interface AssistantMessageItem extends ThreadItemBase {
    type: 'assistant_message';
    content: AssistantMessageContent[];
}
/**
 * Thread item capturing a client tool call.
 */
interface ClientToolCallItem extends ThreadItemBase {
    type: 'client_tool_call';
    status: 'pending' | 'completed';
    call_id: string;
    name: string;
    arguments: Record<string, unknown>;
    output?: unknown;
}
/**
 * Thread item containing widget content.
 */
interface WidgetItem extends ThreadItemBase {
    type: 'widget';
    widget: WidgetRoot;
    copy_text?: string | null;
}
/**
 * Thread item containing a task.
 */
interface TaskItem extends ThreadItemBase {
    type: 'task';
    task: Task;
}
/**
 * Thread item representing a workflow.
 */
interface WorkflowItem extends ThreadItemBase {
    type: 'workflow';
    workflow: Workflow;
}
/**
 * Marker item indicating the assistant ends its turn.
 */
interface EndOfTurnItem extends ThreadItemBase {
    type: 'end_of_turn';
}
/**
 * HiddenContext is never sent to the client. It's not officially part of ChatKit.
 * It is only used internally to store additional context in a specific place in the thread.
 */
interface HiddenContextItem extends ThreadItemBase {
    type: 'hidden_context_item';
    content: unknown;
}
/**
 * Union of all thread item variants.
 */
type ThreadItem = UserMessageItem | AssistantMessageItem | ClientToolCallItem | WidgetItem | WorkflowItem | TaskItem | HiddenContextItem | EndOfTurnItem;
/**
 * Type guard for UserMessageItem.
 */
declare function isUserMessage(item: ThreadItem): item is UserMessageItem;
/**
 * Type guard for AssistantMessageItem.
 */
declare function isAssistantMessage(item: ThreadItem): item is AssistantMessageItem;
/**
 * Type guard for ClientToolCallItem.
 */
declare function isClientToolCall(item: ThreadItem): item is ClientToolCallItem;
/**
 * Type guard for WidgetItem.
 */
declare function isWidgetItem(item: ThreadItem): item is WidgetItem;
/**
 * Type guard for TaskItem.
 */
declare function isTaskItem(item: ThreadItem): item is TaskItem;
/**
 * Type guard for WorkflowItem.
 */
declare function isWorkflowItem(item: ThreadItem): item is WorkflowItem;
/**
 * Type guard for EndOfTurnItem.
 */
declare function isEndOfTurn(item: ThreadItem): item is EndOfTurnItem;
/**
 * Type guard for HiddenContextItem.
 */
declare function isHiddenContext(item: ThreadItem): item is HiddenContextItem;

/**
 * Thread types - conversations and their metadata
 */

/**
 * Status indicating the thread is active.
 */
interface ActiveStatus {
    type: 'active';
}
/**
 * Status indicating the thread is locked.
 */
interface LockedStatus {
    type: 'locked';
    reason?: string | null;
}
/**
 * Status indicating the thread is closed.
 */
interface ClosedStatus {
    type: 'closed';
    reason?: string | null;
}
/**
 * Union of lifecycle states for a thread.
 */
type ThreadStatus = ActiveStatus | LockedStatus | ClosedStatus;
/**
 * Metadata describing a thread without its items.
 */
interface ThreadMetadata {
    id: string;
    title?: string | null;
    created_at: string;
    status: ThreadStatus;
    metadata: Record<string, unknown>;
}
/**
 * Thread with its paginated items.
 */
interface Thread extends ThreadMetadata {
    items: Page<ThreadItem>;
}
/**
 * Type guard to check if status is active.
 */
declare function isActiveStatus(status: ThreadStatus): status is ActiveStatus;
/**
 * Type guard to check if status is locked.
 */
declare function isLockedStatus(status: ThreadStatus): status is LockedStatus;
/**
 * Type guard to check if status is closed.
 */
declare function isClosedStatus(status: ThreadStatus): status is ClosedStatus;

/**
 * Request types - all ChatKit API request payloads
 */

/**
 * Base class for all request payloads.
 */
interface BaseReq {
    /**
     * Arbitrary integration-specific metadata.
     */
    metadata?: Record<string, unknown>;
}
/**
 * User input required to create a thread.
 */
interface ThreadCreateParams {
    input: UserMessageInput;
}
/**
 * Request to create a new thread from a user message.
 */
interface ThreadsCreateReq extends BaseReq {
    type: 'threads.create';
    params: ThreadCreateParams;
}
/**
 * Parameters for adding a user message to a thread.
 */
interface ThreadAddUserMessageParams {
    thread_id: string;
    input: UserMessageInput;
}
/**
 * Request to append a user message to a thread.
 */
interface ThreadsAddUserMessageReq extends BaseReq {
    type: 'threads.add_user_message';
    params: ThreadAddUserMessageParams;
}
/**
 * Parameters for recording tool output in a thread.
 */
interface ThreadAddClientToolOutputParams {
    thread_id: string;
    result: unknown;
}
/**
 * Request to add a client tool's output to a thread.
 */
interface ThreadsAddClientToolOutputReq extends BaseReq {
    type: 'threads.add_client_tool_output';
    params: ThreadAddClientToolOutputParams;
}
/**
 * Parameters specifying which item to retry.
 */
interface ThreadRetryAfterItemParams {
    thread_id: string;
    item_id: string;
}
/**
 * Request to retry processing after a specific thread item.
 */
interface ThreadsRetryAfterItemReq extends BaseReq {
    type: 'threads.retry_after_item';
    params: ThreadRetryAfterItemParams;
}
/**
 * Parameters describing the custom action to execute.
 */
interface ThreadCustomActionParams {
    thread_id: string;
    item_id?: string | null;
    action: ActionConfig;
}
/**
 * Request to execute a custom action within a thread.
 */
interface ThreadsCustomActionReq extends BaseReq {
    type: 'threads.custom_action';
    params: ThreadCustomActionParams;
}
/**
 * Union of request types that produce streaming responses.
 */
type StreamingReq = ThreadsCreateReq | ThreadsAddUserMessageReq | ThreadsAddClientToolOutputReq | ThreadsRetryAfterItemReq | ThreadsCustomActionReq;
/**
 * Parameters for retrieving a thread by id.
 */
interface ThreadGetByIdParams {
    thread_id: string;
}
/**
 * Request to fetch a single thread by its identifier.
 */
interface ThreadsGetByIdReq extends BaseReq {
    type: 'threads.get_by_id';
    params: ThreadGetByIdParams;
}
/**
 * Pagination parameters for listing threads.
 */
interface ThreadListParams {
    limit?: number | null;
    order?: 'asc' | 'desc';
    after?: string | null;
}
/**
 * Request to list threads.
 */
interface ThreadsListReq extends BaseReq {
    type: 'threads.list';
    params: ThreadListParams;
}
/**
 * Parameters for updating a thread's properties.
 */
interface ThreadUpdateParams {
    thread_id: string;
    title: string;
    status?: ThreadStatus;
    metadata?: Record<string, unknown>;
}
/**
 * Request to update thread metadata.
 */
interface ThreadsUpdateReq extends BaseReq {
    type: 'threads.update';
    params: ThreadUpdateParams;
}
/**
 * Parameters identifying a thread to delete.
 */
interface ThreadDeleteParams {
    thread_id: string;
}
/**
 * Request to delete a thread.
 */
interface ThreadsDeleteReq extends BaseReq {
    type: 'threads.delete';
    params: ThreadDeleteParams;
}
/**
 * Pagination parameters for listing thread items.
 */
interface ItemsListParams {
    thread_id: string;
    limit?: number | null;
    order?: 'asc' | 'desc';
    after?: string | null;
}
/**
 * Request to list items inside a thread.
 */
interface ItemsListReq extends BaseReq {
    type: 'items.list';
    params: ItemsListParams;
}
/**
 * Parameters describing feedback targets and sentiment.
 */
interface ItemFeedbackParams {
    thread_id: string;
    item_ids: string[];
    kind: FeedbackKind;
}
/**
 * Request to submit feedback on specific items.
 */
interface ItemsFeedbackReq extends BaseReq {
    type: 'items.feedback';
    params: ItemFeedbackParams;
}
/**
 * Request to register a new attachment.
 */
interface AttachmentsCreateReq extends BaseReq {
    type: 'attachments.create';
    params: AttachmentCreateParams;
}
/**
 * Parameters identifying an attachment to delete.
 */
interface AttachmentDeleteParams {
    attachment_id: string;
}
/**
 * Request to remove an attachment.
 */
interface AttachmentsDeleteReq extends BaseReq {
    type: 'attachments.delete';
    params: AttachmentDeleteParams;
}
/**
 * Union of request types that yield immediate responses.
 */
type NonStreamingReq = ThreadsGetByIdReq | ThreadsListReq | ThreadsUpdateReq | ThreadsDeleteReq | ItemsListReq | ItemsFeedbackReq | AttachmentsCreateReq | AttachmentsDeleteReq;
/**
 * Union of all ChatKit request types.
 */
type ChatKitReq = StreamingReq | NonStreamingReq;
/**
 * Type guard to check if the given request should be processed as streaming.
 */
declare function isStreamingReq(request: ChatKitReq): request is StreamingReq;
/**
 * Type guard to check if the given request should be processed as non-streaming.
 */
declare function isNonStreamingReq(request: ChatKitReq): request is NonStreamingReq;

/**
 * Event types - streaming events emitted to clients
 */

/**
 * Event emitted when a thread is created.
 */
interface ThreadCreatedEvent {
    type: 'thread.created';
    thread: Thread;
}
/**
 * Event emitted when a thread is updated.
 */
interface ThreadUpdatedEvent {
    type: 'thread.updated';
    thread: Thread;
}
/**
 * Event emitted when a new item is added to a thread.
 */
interface ThreadItemAddedEvent {
    type: 'thread.item.added';
    item: ThreadItem;
}
/**
 * Event emitted when a thread item is marked complete.
 */
interface ThreadItemDoneEvent {
    type: 'thread.item.done';
    item: ThreadItem;
}
/**
 * Event emitted when a thread item is replaced.
 */
interface ThreadItemReplacedEvent {
    type: 'thread.item.replaced';
    item: ThreadItem;
}
/**
 * Event emitted when a thread item is removed.
 */
interface ThreadItemRemovedEvent {
    type: 'thread.item.removed';
    item_id: string;
}
/**
 * Event describing an update to an existing thread item.
 */
interface ThreadItemUpdated {
    type: 'thread.item.updated';
    item_id: string;
    update: ThreadItemUpdate;
}
/**
 * Event emitted when new assistant content is appended.
 */
interface AssistantMessageContentPartAdded {
    type: 'assistant_message.content_part.added';
    content_index: number;
    content: AssistantMessageContent;
}
/**
 * Event carrying incremental assistant text output.
 */
interface AssistantMessageContentPartTextDelta {
    type: 'assistant_message.content_part.text_delta';
    content_index: number;
    delta: string;
}
/**
 * Event announcing a new annotation on assistant content.
 */
interface AssistantMessageContentPartAnnotationAdded {
    type: 'assistant_message.content_part.annotation_added';
    content_index: number;
    annotation_index: number;
    annotation: Annotation;
}
/**
 * Event indicating an assistant content part is finalized.
 */
interface AssistantMessageContentPartDone {
    type: 'assistant_message.content_part.done';
    content_index: number;
    content: AssistantMessageContent;
}
/**
 * Event streaming widget text deltas.
 */
interface WidgetStreamingTextValueDelta {
    type: 'widget.streaming_text.value_delta';
    component_id: string;
    delta: string;
    done: boolean;
}
/**
 * Event published when the widget root changes.
 */
interface WidgetRootUpdated {
    type: 'widget.root.updated';
    widget: WidgetRoot;
}
/**
 * Event emitted when a widget component updates.
 */
interface WidgetComponentUpdated {
    type: 'widget.component.updated';
    component_id: string;
    component: WidgetComponent;
}
/**
 * Event emitted when a workflow task is added.
 */
interface WorkflowTaskAdded {
    type: 'workflow.task.added';
    task_index: number;
    task: Task;
}
/**
 * Event emitted when a workflow task is updated.
 */
interface WorkflowTaskUpdated {
    type: 'workflow.task.updated';
    task_index: number;
    task: Task;
}
/**
 * Union of possible updates applied to thread items.
 */
type ThreadItemUpdate = AssistantMessageContentPartAdded | AssistantMessageContentPartTextDelta | AssistantMessageContentPartAnnotationAdded | AssistantMessageContentPartDone | WidgetStreamingTextValueDelta | WidgetComponentUpdated | WidgetRootUpdated | WorkflowTaskAdded | WorkflowTaskUpdated;
/**
 * Event providing incremental progress from the assistant.
 */
interface ProgressUpdateEvent {
    type: 'progress_update';
    text: string;
    icon?: IconName | null;
}
/**
 * Event indicating an error occurred while processing a thread.
 */
interface ErrorEvent {
    type: 'error';
    code?: string;
    message?: string | null;
    allow_retry: boolean;
}
/**
 * Event conveying a user-facing notice.
 */
interface NoticeEvent {
    type: 'notice';
    level: 'info' | 'warning' | 'danger';
    /**
     * Supports markdown e.g. "You've reached your limit of 100 messages. [Upgrade](https://...) to a paid plan."
     */
    message: string;
    title?: string | null;
}
/**
 * Union of all streaming events emitted to clients.
 */
type ThreadStreamEvent = ThreadCreatedEvent | ThreadUpdatedEvent | ThreadItemDoneEvent | ThreadItemAddedEvent | ThreadItemUpdated | ThreadItemRemovedEvent | ThreadItemReplacedEvent | ProgressUpdateEvent | ErrorEvent | NoticeEvent;
/**
 * Type guard for ThreadCreatedEvent.
 */
declare function isThreadCreatedEvent(event: ThreadStreamEvent): event is ThreadCreatedEvent;
/**
 * Type guard for ThreadUpdatedEvent.
 */
declare function isThreadUpdatedEvent(event: ThreadStreamEvent): event is ThreadUpdatedEvent;
/**
 * Type guard for ThreadItemAddedEvent.
 */
declare function isThreadItemAddedEvent(event: ThreadStreamEvent): event is ThreadItemAddedEvent;
/**
 * Type guard for ThreadItemDoneEvent.
 */
declare function isThreadItemDoneEvent(event: ThreadStreamEvent): event is ThreadItemDoneEvent;
/**
 * Type guard for ThreadItemReplacedEvent.
 */
declare function isThreadItemReplacedEvent(event: ThreadStreamEvent): event is ThreadItemReplacedEvent;
/**
 * Type guard for ThreadItemRemovedEvent.
 */
declare function isThreadItemRemovedEvent(event: ThreadStreamEvent): event is ThreadItemRemovedEvent;
/**
 * Type guard for ErrorEvent.
 */
declare function isErrorEvent(event: ThreadStreamEvent): event is ErrorEvent;
/**
 * Type guard for ProgressUpdateEvent.
 */
declare function isProgressUpdateEvent(event: ThreadStreamEvent): event is ProgressUpdateEvent;
/**
 * Type guard for NoticeEvent.
 */
declare function isNoticeEvent(event: ThreadStreamEvent): event is NoticeEvent;

/**
 * Store types - data persistence interfaces
 */
/**
 * Type of store item for ID generation.
 */
type StoreItemType = 'message' | 'tool_call' | 'task' | 'workflow' | 'attachment';
/**
 * Error thrown when a requested resource is not found in the store.
 */
declare class NotFoundError$1 extends Error {
    constructor(message: string);
}

/**
 * Error classes for ChatKit SDK
 */
/**
 * Error codes that can be emitted in error events.
 */
declare enum ErrorCode {
    STREAM_ERROR = "stream.error",
    INTERNAL_ERROR = "internal.error",
    INVALID_REQUEST = "invalid.request",
    THREAD_NOT_FOUND = "thread.not_found",
    ITEM_NOT_FOUND = "item.not_found",
    ATTACHMENT_NOT_FOUND = "attachment.not_found",
    THREAD_LOCKED = "thread.locked",
    THREAD_CLOSED = "thread.closed"
}
/**
 * Error thrown during stream processing that should be conveyed to the client.
 */
declare class StreamError extends Error {
    code: string | ErrorCode;
    allowRetry: boolean;
    constructor(code: string | ErrorCode, allowRetry?: boolean);
}
/**
 * Custom error with a user-facing message that should be displayed to the client.
 */
declare class CustomStreamError extends Error {
    allowRetry: boolean;
    constructor(message: string, allowRetry?: boolean);
}

/**
 * Store - Abstract storage interface for ChatKit server
 *
 * Users must implement this interface to provide persistence for threads,
 * items, and attachments. Can use any storage backend (memory, SQL, NoSQL, etc.)
 */

declare class NotFoundError extends Error {
    constructor(message: string);
}
/**
 * Abstract Store class
 *
 * Implement all abstract methods to provide persistence for your ChatKit server.
 *
 * @example
 * ```typescript
 * class MyStore extends Store<{ userId: string }> {
 *   async loadThread(threadId, context) {
 *     // Load from database
 *   }
 *   // ... implement other methods
 * }
 * ```
 */
declare abstract class Store<TContext = unknown> {
    /**
     * Generate a thread ID
     *
     * Override to customize ID format. Default: 'thr_' + 8 random hex chars
     */
    generateThreadId(_context: TContext): string;
    /**
     * Generate an item ID
     *
     * Override to customize ID format. Default: type-specific prefix + 8 random hex chars
     */
    generateItemId(type: StoreItemType, _thread: ThreadMetadata, _context: TContext): string;
    /**
     * Load a thread by ID
     *
     * @throws NotFoundError if thread doesn't exist
     */
    abstract loadThread(threadId: string, context: TContext): Promise<ThreadMetadata>;
    /**
     * Save a thread (insert or update)
     */
    abstract saveThread(thread: ThreadMetadata, context: TContext): Promise<void>;
    /**
     * Delete a thread and all its items
     */
    abstract deleteThread(threadId: string, context: TContext): Promise<void>;
    /**
     * Load a paginated list of threads
     *
     * @param limit - Max number of threads to return
     * @param after - Cursor for pagination (null for first page)
     * @param order - Sort order: 'asc' or 'desc' by created_at
     * @param context - Request context
     */
    abstract loadThreads(limit: number, after: string | null, order: 'asc' | 'desc', context: TContext): Promise<Page<ThreadMetadata>>;
    /**
     * Load items for a thread
     *
     * @param threadId - Thread ID
     * @param after - Cursor for pagination (null for first page)
     * @param limit - Max number of items to return
     * @param order - Sort order: 'asc' or 'desc' by created_at
     * @param context - Request context
     */
    abstract loadThreadItems(threadId: string, after: string | null, limit: number, order: 'asc' | 'desc', context: TContext): Promise<Page<ThreadItem>>;
    /**
     * Add a new item to a thread
     */
    abstract addThreadItem(threadId: string, item: ThreadItem, context: TContext): Promise<void>;
    /**
     * Update an existing item
     */
    abstract saveItem(threadId: string, item: ThreadItem, context: TContext): Promise<void>;
    /**
     * Load a specific item
     *
     * @throws NotFoundError if item doesn't exist
     */
    abstract loadItem(threadId: string, itemId: string, context: TContext): Promise<ThreadItem>;
    /**
     * Delete an item from a thread
     */
    abstract deleteThreadItem(threadId: string, itemId: string, context: TContext): Promise<void>;
    /**
     * Save attachment metadata
     */
    abstract saveAttachment(attachment: Attachment, context: TContext): Promise<void>;
    /**
     * Load attachment metadata
     *
     * @throws NotFoundError if attachment doesn't exist
     */
    abstract loadAttachment(attachmentId: string, context: TContext): Promise<Attachment>;
    /**
     * Delete attachment metadata
     */
    abstract deleteAttachment(attachmentId: string, context: TContext): Promise<void>;
}

/**
 * AttachmentStore - Abstract interface for file attachment storage
 *
 * Handles the storage and retrieval of file attachments (images, documents, etc.)
 * Separate from Store to allow different storage backends (S3, local, etc.)
 */

/**
 * Abstract AttachmentStore class
 *
 * Implement to provide file storage for attachments.
 *
 * @example
 * ```typescript
 * class S3AttachmentStore extends AttachmentStore<{ userId: string }> {
 *   async createAttachment(params, context) {
 *     // Generate presigned S3 URL
 *     // Return attachment with upload_url
 *   }
 *
 *   async deleteAttachment(attachmentId, context) {
 *     // Delete from S3
 *   }
 * }
 * ```
 */
declare abstract class AttachmentStore<TContext = unknown> {
    /**
     * Generate an attachment ID
     *
     * Override to customize ID format. Default: 'atc_' + 8 random hex chars
     */
    generateAttachmentId(_mimeType: string, _context: TContext): string;
    /**
     * Create an attachment and return upload URL
     *
     * For two-phase upload pattern:
     * 1. Client calls attachments.create to get upload_url
     * 2. Client uploads file to upload_url
     * 3. File is now available at the attachment's permanent URL
     *
     * @param params - Attachment metadata (name, size, mime_type)
     * @param context - Request context
     * @returns Attachment with upload_url for client to upload to
     */
    abstract createAttachment(params: AttachmentCreateParams, context: TContext): Promise<Attachment>;
    /**
     * Delete an attachment file
     *
     * Called when attachment is deleted. Should remove the file from storage.
     *
     * @param attachmentId - Attachment ID
     * @param context - Request context
     */
    abstract deleteAttachment(attachmentId: string, context: TContext): Promise<void>;
}

/**
 * Simple logging interface
 */
interface Logger {
    info(message: string, extra?: Record<string, unknown>): void;
    warn(message: string, extra?: Record<string, unknown>): void;
    error(message: string, extra?: Record<string, unknown>): void;
    debug(message: string, extra?: Record<string, unknown>): void;
}
/**
 * Default logger instance
 */
declare const defaultLogger: Logger;

/**
 * Result classes for streaming and non-streaming responses
 */

/**
 * Streaming result that formats events as Server-Sent Events (SSE).
 * Format: `data: {json}\n\n` for each event.
 */
declare class StreamingResult {
    readonly isStreaming = true;
    private generator;
    constructor(generator: AsyncGenerator<ThreadStreamEvent>);
    /**
     * Async iterator that yields SSE-formatted strings.
     */
    [Symbol.asyncIterator](): AsyncGenerator<string>;
}
/**
 * Non-streaming result that returns a JSON response.
 */
declare class NonStreamingResult {
    readonly isStreaming = false;
    private data;
    constructor(data: unknown);
    /**
     * Get the response data as a JSON-serializable object.
     */
    toJSON(): unknown;
    /**
     * Get the response data as a JSON string.
     */
    toString(): string;
}

/**
 * ChatKitServer - Abstract base class for implementing ChatKit backend servers
 *
 * Users extend this class and implement the abstract `respond()` method to handle
 * incoming messages. The server handles request routing, event streaming, error
 * handling, and storage integration.
 */

/**
 * Abstract ChatKitServer class
 *
 * @example
 * ```typescript
 * class MyServer extends ChatKitServer<{ userId: string }> {
 *   async *respond(thread, inputUserMessage, context) {
 *     // Your implementation here
 *     yield {
 *       type: 'thread.item.done',
 *       item: {
 *         type: 'assistant_message',
 *         // ... message details
 *       }
 *     };
 *   }
 * }
 * ```
 */
declare abstract class ChatKitServer<TContext = unknown> {
    protected store: Store<TContext>;
    protected attachmentStore?: AttachmentStore<TContext>;
    protected logger: Logger;
    constructor(store: Store<TContext>, attachmentStore?: AttachmentStore<TContext>, logger?: Logger);
    /**
     * Get the configured attachment store or throw if not configured
     */
    protected getAttachmentStore(): AttachmentStore<TContext>;
    /**
     * Abstract method: Stream ThreadStreamEvent instances for a new user message
     *
     * This is the primary method users must implement to handle incoming messages
     * and generate responses.
     *
     * @param thread - Metadata for the thread being processed
     * @param inputUserMessage - The incoming message to respond to, or null for retry/tool output
     * @param context - Per-request context provided by the caller
     * @returns AsyncGenerator yielding ThreadStreamEvent instances
     */
    abstract respond(thread: ThreadMetadata, inputUserMessage: UserMessageItem | null, context: TContext): AsyncGenerator<ThreadStreamEvent>;
    /**
     * Optional: Handle feedback on thread items
     *
     * Override this method to store or process user feedback (thumbs up/down).
     * Default implementation does nothing.
     *
     * @param threadId - Thread ID
     * @param itemIds - List of item IDs receiving feedback
     * @param feedback - 'positive' or 'negative'
     * @param context - Request context
     */
    addFeedback(threadId: string, itemIds: string[], feedback: FeedbackKind, _context: TContext): Promise<void>;
    /**
     * Optional: Handle custom actions from widgets
     *
     * Override this method to react to button clicks and form submissions from widgets.
     * Default implementation throws NotImplementedError.
     *
     * @param thread - Thread metadata
     * @param action - Action payload from widget
     * @param sender - Widget item that sent the action, if any
     * @param context - Request context
     * @returns AsyncGenerator yielding ThreadStreamEvent instances
     */
    action(_thread: ThreadMetadata, _action: Action, _sender: WidgetItem | null, _context: TContext): AsyncGenerator<ThreadStreamEvent>;
    /**
     * Main entry point: Process a ChatKit request
     *
     * Parses the request JSON, routes to appropriate handler, and returns
     * either a StreamingResult or NonStreamingResult.
     *
     * @param request - JSON request string or buffer
     * @param context - Per-request context
     * @returns StreamingResult or NonStreamingResult
     */
    process(request: string | Buffer, context: TContext): Promise<StreamingResult | NonStreamingResult>;
    /**
     * Process non-streaming requests (returns JSON)
     */
    protected processNonStreaming(request: NonStreamingReq, context: TContext): Promise<unknown>;
    /**
     * Process streaming requests (returns SSE stream)
     */
    protected processStreaming(request: StreamingReq, context: TContext): AsyncGenerator<ThreadStreamEvent>;
    /**
     * Implementation of streaming request processing
     */
    protected processStreamingImpl(request: StreamingReq, context: TContext): AsyncGenerator<ThreadStreamEvent>;
    /**
     * Process a new user message and generate response
     */
    protected processNewThreadItemRespond(thread: ThreadMetadata, item: UserMessageItem, context: TContext): AsyncGenerator<ThreadStreamEvent>;
    /**
     * Process events from user's respond() method
     *
     * Handles:
     * - Saving items to store
     * - Error handling
     * - Thread updates
     * - Filtering hidden context items
     */
    protected processEvents(thread: ThreadMetadata, context: TContext, streamFn: () => AsyncGenerator<ThreadStreamEvent>): AsyncGenerator<ThreadStreamEvent>;
    /**
     * Build a UserMessageItem from input
     */
    protected buildUserMessageItem(input: any, thread: ThreadMetadata, context: TContext): Promise<UserMessageItem>;
    /**
     * Load a full thread with items
     */
    protected loadFullThread(threadId: string, context: TContext): Promise<Thread>;
    /**
     * Convert ThreadMetadata or Thread to Thread response
     * (filters out hidden context items)
     */
    protected toThreadResponse(thread: ThreadMetadata | Thread): Thread;
}

/**
 * ID generation utilities for threads, items, and attachments
 */

/**
 * Generate a random ID with the given prefix.
 * Format: {prefix}_{8 random hex characters}
 * Example: "thr_a1b2c3d4" or "msg_1a2b3c4d"
 */
declare function generateId(prefix: string): string;
/**
 * Generate a thread ID.
 * Default implementation: Returns generateId('thr')
 */
declare function defaultGenerateThreadId(): string;
/**
 * Generate an item ID based on the item type.
 * Maps type to prefix:
 * - 'message' → 'msg'
 * - 'tool_call' → 'tc'
 * - 'task' → 'task'
 * - 'workflow' → 'wf'
 * - 'attachment' → 'atc'
 */
declare function defaultGenerateItemId(type: StoreItemType): string;
/**
 * Generate an attachment ID.
 * Default implementation: Returns generateId('atc')
 */
declare function defaultGenerateAttachmentId(): string;

/**
 * Client tool call configuration.
 * Set this on AgentContext to trigger a client-side tool execution.
 */
interface ClientToolCall {
    /** Name of the client-side tool to call */
    name: string;
    /** Arguments to pass to the client tool */
    arguments: Record<string, any>;
}
/**
 * Async queue for managing custom events in AgentContext.
 * Implements AsyncIterable so it can be consumed as an async generator.
 */
declare class AsyncEventQueue<T> implements AsyncIterable<T> {
    private queue;
    private resolvers;
    private completed;
    static COMPLETE: symbol;
    /**
     * Add an event to the queue
     */
    push(event: T): void;
    /**
     * Mark the queue as complete
     */
    complete(): void;
    /**
     * Get next event from queue (async)
     */
    private next;
    /**
     * Implement AsyncIterable
     */
    [Symbol.asyncIterator](): AsyncGenerator<T>;
}
/**
 * Context object passed to Agent execution that combines ChatKit-specific data
 * with user-defined request context.
 *
 * This allows Agents to access the current thread, store, and any custom
 * context data (like user ID, tenant ID, etc.) during execution.
 *
 * Provides methods for tools to emit custom events (widgets, workflows, etc.)
 * that will be merged with Agent SDK response streams.
 *
 * @template TContext - The user-defined context type (default: unknown)
 *
 * @example
 * ```typescript
 * interface MyContext {
 *   userId: string;
 *   tenantId: string;
 * }
 *
 * const agentContext: AgentContext<MyContext> = {
 *   thread: currentThread,
 *   store: myStore,
 *   requestContext: { userId: 'user123', tenantId: 'tenant456' },
 *   _events: new AsyncEventQueue()
 * };
 *
 * // In a tool:
 * await agentContext.streamWidget(myWidget);
 * ```
 */
interface AgentContext<TContext = unknown> {
    /** The current ChatKit thread being processed */
    thread: ThreadMetadata;
    /** The store instance for persisting thread data */
    store: Store<TContext>;
    /** User-defined request context (e.g., user ID, session data, etc.) */
    requestContext: TContext;
    /**
     * Internal event queue for custom events (widgets, workflows, etc.)
     * @internal
     */
    _events: AsyncEventQueue<ThreadStreamEvent>;
    /**
     * Previous response ID for conversation chaining.
     * Used with OpenAI's Responses API to maintain server-side conversation state.
     *
     * NEW: Python SDK parity feature!
     *
     * @example
     * ```typescript
     * // Track response ID for next request
     * context.previousResponseId = result.response_id;
     * ```
     */
    previousResponseId?: string | null;
    /**
     * Current active workflow item.
     * Tracks custom workflows created by tools during execution.
     *
     * NEW: Python SDK parity feature!
     *
     * @example
     * ```typescript
     * // Start a workflow
     * await context.startWorkflow({ type: 'custom', tasks: [] });
     * console.log(context.workflowItem?.id); // "wf_abc123"
     * ```
     */
    workflowItem?: WorkflowItem | null;
    /**
     * Client tool call to be executed on the client-side.
     * When set by a tool, this will be emitted as a ClientToolCallItem at the end of the stream.
     *
     * @example
     * ```typescript
     * // In a tool's execute function:
     * context.clientToolCall = {
     *   name: 'add_to_todo_list',
     *   arguments: { task: 'Buy groceries' }
     * };
     * ```
     */
    clientToolCall?: ClientToolCall;
    /**
     * Generate a unique ID for a thread item.
     *
     * Convenience method for generating IDs without calling store methods directly.
     *
     * NEW: Python SDK parity feature!
     *
     * @param type - The type of item to generate an ID for
     * @param thread - Optional thread metadata (defaults to context.thread)
     * @returns A unique ID string
     *
     * @example
     * ```typescript
     * const itemId = context.generateId('message');
     * const workflowId = context.generateId('workflow');
     * ```
     */
    generateId(type: StoreItemType, thread?: ThreadMetadata): string;
    /**
     * Start a new workflow.
     *
     * Workflows are multi-step progress indicators shown to users.
     * Use this to create custom workflows that display task progress.
     *
     * NEW: Python SDK parity feature!
     *
     * @param workflow - The workflow configuration
     *
     * @example
     * ```typescript
     * // In a tool that processes data
     * async execute(params, { context }) {
     *   await context.startWorkflow({
     *     type: 'custom',
     *     tasks: [],
     *     expanded: true,
     *     summary: null
     *   });
     *
     *   // Add tasks as work progresses...
     * }
     * ```
     */
    startWorkflow(workflow: Workflow): Promise<void>;
    /**
     * End the current workflow.
     *
     * Completes the active workflow with an optional summary.
     * The workflow will be saved to the database and marked as complete.
     *
     * NEW: Python SDK parity feature!
     *
     * @param summary - Optional summary to display when collapsed
     * @param expanded - Whether to keep the workflow expanded (default: false)
     *
     * @example
     * ```typescript
     * // End workflow with duration summary
     * await context.endWorkflow(
     *   { type: 'duration', duration: 30 },
     *   false  // collapsed
     * );
     * ```
     */
    endWorkflow(summary?: WorkflowSummary | null, expanded?: boolean): Promise<void>;
    /**
     * Add a task to the current workflow.
     *
     * Creates or updates the active workflow with a new task.
     * If no workflow is active, creates one automatically.
     *
     * NEW: Python SDK parity feature!
     *
     * @param task - The task to add to the workflow
     *
     * @example
     * ```typescript
     * await context.addWorkflowTask({
     *   type: 'custom',
     *   title: 'Loading data',
     *   content: 'Reading 1000 rows from database...'
     * });
     *
     * // Later, update it
     * await context.updateWorkflowTask(
     *   { type: 'custom', title: 'Loading data', content: '✓ Loaded 1000 rows' },
     *   0  // task index
     * );
     * ```
     */
    addWorkflowTask(task: Task): Promise<void>;
    /**
     * Update an existing task in the current workflow.
     *
     * Modifies a task at the specified index, useful for showing progress updates.
     *
     * NEW: Python SDK parity feature!
     *
     * @param task - The updated task
     * @param taskIndex - The index of the task to update
     *
     * @example
     * ```typescript
     * // Update task status from "in progress" to "complete"
     * await context.updateWorkflowTask(
     *   {
     *     type: 'custom',
     *     title: 'Processing',
     *     content: '✓ Completed 100/100 items'
     *   },
     *   1  // second task
     * );
     * ```
     */
    updateWorkflowTask(task: Task, taskIndex: number): Promise<void>;
    /**
     * Emit a custom ThreadStreamEvent.
     * This is typically used by tools to send custom events alongside Agent SDK responses.
     *
     * @param event - The ThreadStreamEvent to emit
     *
     * @example
     * ```typescript
     * await context.stream({
     *   type: 'thread.item.added',
     *   item: myCustomItem
     * });
     * ```
     */
    stream(event: ThreadStreamEvent): Promise<void>;
    /**
     * Stream a widget to the chat interface.
     * Can accept either a static widget or an async generator for streaming updates.
     *
     * @param widget - Static widget or async generator yielding widget states
     * @param copyText - Optional text for copy-to-clipboard functionality
     *
     * @example
     * ```typescript
     * // Static widget
     * await context.streamWidget({
     *   type: 'Card',
     *   children: [{ type: 'Text', value: 'Hello!' }]
     * });
     *
     * // Streaming widget
     * async function* widgetGenerator() {
     *   yield { type: 'Card', children: [{ type: 'Text', id: 'msg', value: 'Loading...' }] };
     *   yield { type: 'Card', children: [{ type: 'Text', id: 'msg', value: 'Complete!' }] };
     * }
     * await context.streamWidget(widgetGenerator());
     * ```
     */
    streamWidget(widget: WidgetRoot | AsyncGenerator<WidgetRoot, void, undefined>, copyText?: string | null): Promise<void>;
}

/**
 * AgentContext Helper Functions
 *
 * This module provides helper functions to create and work with AgentContext instances.
 */

/**
 * Create an AgentContext with all required methods implemented.
 *
 * This factory function creates a complete AgentContext instance with the
 * stream() and streamWidget() methods properly implemented.
 *
 * @template TContext - The user-defined context type
 * @param thread - The current thread metadata
 * @param store - The store instance
 * @param requestContext - User-defined request context
 * @returns A complete AgentContext instance
 *
 * @example
 * ```typescript
 * const context = createAgentContext(
 *   currentThread,
 *   myStore,
 *   { userId: 'user123' }
 * );
 *
 * // Use in tools:
 * await context.streamWidget(myWidget);
 * ```
 */
declare function createAgentContext<TContext = unknown>(thread: ThreadMetadata, store: Store<TContext>, requestContext: TContext): AgentContext<TContext>;

/**
 * Input Thread Item Converter
 *
 * Converts ChatKit ThreadItems to Agent SDK input format.
 * This is the INPUT direction (Database → Agent).
 *
 * This is the missing piece from the TypeScript SDK that exists in Python SDK.
 * Enables the AI to see widgets, workflows, and tasks from conversation history.
 *
 * Based on: chatkit-python/chatkit/agents.py lines 628-933
 */

/**
 * Type representing Agent SDK input items.
 * Matches OpenAI Responses API input format.
 */
type ResponseInputItem = ResponseInputMessage | ResponseFunctionToolCall | ResponseFunctionCallOutput;
interface ResponseInputMessage {
    type: 'message';
    role: 'user' | 'assistant';
    content: ResponseInputContentParam[];
}
type ResponseInputContentParam = ResponseInputTextParam | ResponseInputImageParam;
interface ResponseInputTextParam {
    type: 'input_text';
    text: string;
}
interface ResponseInputImageParam {
    type: 'input_image';
    source: {
        type: 'url';
        url: string;
    };
}
interface ResponseFunctionToolCall {
    type: 'function_call';
    call_id: string;
    name: string;
    arguments: string;
}
interface ResponseFunctionCallOutput {
    type: 'function_call_output';
    call_id: string;
    output: string;
}
/**
 * Converts ChatKit thread items to Agent SDK input format.
 *
 * This class provides the missing INPUT conversion functionality that exists
 * in Python SDK but was missing in TypeScript SDK.
 *
 * Key capabilities:
 * - Convert widgets to descriptive text for the AI
 * - Convert workflows to task summaries
 * - Convert full thread history to agent input
 * - Handle attachments, tags, and special content types
 *
 * @example Basic usage
 * ```typescript
 * const converter = new InputThreadItemConverter();
 *
 * // Load thread history
 * const items = await store.loadThreadItems(threadId, null, 50, 'asc', context);
 *
 * // Convert to agent input
 * const agentInput = await converter.toAgentInput(items.data);
 *
 * // Pass to Agent SDK
 * const result = await run(agent, agentInput, { context });
 * ```
 *
 * @example Custom attachment handling
 * ```typescript
 * class MyConverter extends InputThreadItemConverter {
 *   async attachmentToMessageContent(attachment: Attachment): Promise<ResponseInputContentParam> {
 *     if (attachment.mime_type.startsWith('image/')) {
 *       return {
 *         type: 'input_image',
 *         source: { type: 'url', url: attachment.url }
 *       };
 *     }
 *     return {
 *       type: 'input_text',
 *       text: `[File: ${attachment.filename}]`
 *     };
 *   }
 * }
 * ```
 */
declare class InputThreadItemConverter {
    /**
     * Convert an attachment to message content.
     *
     * REQUIRED when attachments are used in your application.
     * Override this method to handle your attachment storage system.
     *
     * @param attachment - The attachment to convert
     * @returns Message content representing the attachment
     * @throws Error if not implemented and attachments are present
     */
    attachmentToMessageContent(_attachment: Attachment): Promise<ResponseInputContentParam>;
    /**
     * Convert a tag (@-mention) to message content.
     *
     * REQUIRED when tags are used in your application.
     * Tags allow users to reference entities like "@customer-123" or "@ticket-456".
     *
     * @param tag - The tag content from user message
     * @returns Message content providing context about the tagged entity
     * @throws Error if not implemented and tags are present
     *
     * @example
     * ```typescript
     * async tagToMessageContent(tag: { type: 'input_tag'; text: string }): Promise<ResponseInputContentParam> {
     *   // Lookup entity by tag
     *   const customer = await db.customers.findByTag(tag.text);
     *   return {
     *     type: 'input_text',
     *     text: `Customer: ${customer.name} (ID: ${customer.id})`
     *   };
     * }
     * ```
     */
    tagToMessageContent(_tag: Extract<UserMessageContent, {
        type: 'input_tag';
    }>): ResponseInputContentParam;
    /**
     * Convert a HiddenContextItem to agent input.
     *
     * REQUIRED when HiddenContextItems are used.
     * These are system-level context items not visible to users.
     *
     * @param item - The hidden context item
     * @returns Input items for the agent, or null to skip
     * @throws Error if not implemented and hidden context items are present
     */
    hiddenContextToInput(_item: HiddenContextItem): ResponseInputItem | ResponseInputItem[] | null;
    /**
     * Convert a WidgetItem to agent input.
     *
     * By default, converts widget to JSON description so AI knows it was displayed.
     * Override to customize how widgets are described to the AI.
     *
     * @param item - The widget item from thread history
     * @returns Input message describing the widget, or null to skip
     *
     * @example Default behavior
     * ```typescript
     * // Widget item with id "wid_123" becomes:
     * {
     *   type: 'message',
     *   role: 'user',
     *   content: [{
     *     type: 'input_text',
     *     text: 'The following graphical UI widget (id: wid_123) was displayed to the user: {"type":"Card","children":[...]}'
     *   }]
     * }
     * ```
     */
    widgetToInput(item: WidgetItem): ResponseInputItem | null;
    /**
     * Convert a WorkflowItem to agent input messages.
     *
     * By default, workflows are SKIPPED from AI context (returns empty array).
     * Workflows are visual progress indicators - the AI doesn't need to see them in history.
     * The actual tool result contains the important information.
     *
     * Note: Workflows remain visible in the UI when loading thread history.
     * They're only skipped from the AI's conversation context.
     *
     * @param item - The workflow item from thread history
     * @returns Empty array (workflows skipped by default)
     *
     * @example To include workflows in AI context, override this method:
     * ```typescript
     * workflowToInput(item: WorkflowItem): ResponseInputItem[] {
     *   if (item.workflow.type === 'reasoning') {
     *     return []; // Skip AI's own thinking
     *   }
     *
     *   const messages: ResponseInputItem[] = [];
     *   for (const task of item.workflow.tasks) {
     *     if (task.type === 'custom' && (task.title || task.content)) {
     *       const taskText = task.title && task.content
     *         ? `${task.title}: ${task.content}`
     *         : task.title || task.content;
     *       messages.push({
     *         type: 'message',
     *         role: 'user',
     *         content: [{
     *           type: 'input_text',
     *           text: `Task performed: ${taskText}`
     *         }]
     *       });
     *     }
     *   }
     *   return messages;
     * }
     * ```
     */
    workflowToInput(_item: WorkflowItem): ResponseInputItem[];
    /**
     * Convert a TaskItem to agent input.
     *
     * By default, converts custom tasks to a message describing the work performed.
     *
     * @param item - The task item from thread history
     * @returns Input message describing the task, or null to skip
     */
    taskToInput(item: TaskItem): ResponseInputItem | null;
    /**
     * Convert a UserMessageItem to agent input.
     *
     * Handles:
     * - Text content
     * - Attachments (images, files)
     * - Tags (@-mentions)
     * - Quoted text (reply-to context)
     *
     * @param item - The user message item
     * @param isLastMessage - Whether this is the last message in the sequence (affects quoted text handling)
     * @returns Array of input messages (user text + optional context messages)
     *
     * @example
     * ```typescript
     * // User message with text and tag becomes:
     * [
     *   {
     *     type: 'message',
     *     role: 'user',
     *     content: [
     *       { type: 'input_text', text: 'Show me details for @customer-123' }
     *     ]
     *   },
     *   {
     *     type: 'message',
     *     role: 'user',
     *     content: [
     *       {
     *         type: 'input_text',
     *         text: '# User-provided context for @-mentions\n...\nCustomer: John Doe (ID: 123)'
     *       }
     *     ]
     *   }
     * ]
     * ```
     */
    userMessageToInput(item: UserMessageItem, isLastMessage?: boolean): Promise<ResponseInputItem[]>;
    /**
     * Convert an AssistantMessageItem to agent input.
     *
     * By default, SKIPS assistant messages (returns null) to avoid conflicts with previousResponseId.
     * The Agents SDK doesn't handle explicit assistant messages well in conversation history.
     *
     * Override this method if you need assistant messages in history (not recommended).
     *
     * @param item - The assistant message item
     * @returns null (assistant messages skipped by default)
     */
    assistantMessageToInput(_item: AssistantMessageItem): Promise<ResponseInputItem | null>;
    /**
     * Convert a ClientToolCallItem to agent input.
     *
     * Converts both the tool call and its result to agent input format.
     * Skips pending tool calls (not yet completed).
     *
     * @param item - The client tool call item
     * @returns Array of [function_call, function_call_output], or empty array if pending
     */
    clientToolCallToInput(item: ClientToolCallItem): Promise<ResponseInputItem[]>;
    /**
     * Convert an EndOfTurnItem to agent input.
     *
     * These are UI hints for turn boundaries - not sent to the model.
     *
     * @param item - The end of turn item
     * @returns null (always skipped)
     */
    endOfTurnToInput(_item: EndOfTurnItem): Promise<null>;
    /**
     * Internal: Convert a single thread item to agent input items.
     * Routes to appropriate conversion method based on item type.
     */
    private threadItemToInputItems;
    /**
     * Convert full thread history to agent input.
     *
     * This is the main method you'll use. Pass in an array of ThreadItems
     * (typically loaded from your store) and get back agent input ready
     * to send to the Agent SDK.
     *
     * @param items - Array of thread items (usually from store.loadThreadItems())
     * @returns Array of input items for Agent SDK
     *
     * @example
     * ```typescript
     * // Load recent thread history
     * const historyResult = await store.loadThreadItems(
     *   threadId,
     *   null,  // after
     *   50,    // limit
     *   'asc', // chronological order
     *   context
     * );
     *
     * // Convert to agent input (includes widgets, workflows, tasks!)
     * const converter = new InputThreadItemConverter();
     * const agentInput = await converter.toAgentInput(historyResult.data);
     *
     * // Pass to agent
     * const result = await run(agent, agentInput, {
     *   stream: true,
     *   context: agentContext
     *   // Note: Don't use previousResponseId when using manual history
     * });
     * ```
     */
    toAgentInput(items: ThreadItem[]): Promise<ResponseInputItem[]>;
}
/**
 * Default converter instance.
 * Use this for simple cases without custom attachment/tag handling.
 */
declare const defaultInputConverter: InputThreadItemConverter;

/**
 * Converts a ChatKit UserMessageItem to Agent SDK input format (simple version).
 *
 * This is a simple converter that extracts text content from the user message
 * and formats it for the Agent SDK. For more complex conversions (e.g., handling
 * attachments, multiple content types), you can create a custom converter.
 *
 * @param userMessage - The ChatKit user message to convert
 * @returns Agent SDK input format (array of message objects)
 *
 * @example Single message (simple)
 * ```typescript
 * const userMessage: UserMessageItem = {
 *   type: 'user_message',
 *   id: 'msg_123',
 *   thread_id: 'thr_abc',
 *   created_at: '2025-10-09T12:00:00Z',
 *   content: [{
 *     type: 'input_text',
 *     text: 'Hello, how can you help me?'
 *   }],
 *   attachments: [],
 *   inference_options: {}
 * };
 *
 * const agentInput = await simpleToAgentInput(userMessage);
 * // Returns: [{ role: 'user', content: 'Hello, how can you help me?' }]
 * ```
 */
declare function simpleToAgentInput(userMessage: UserMessageItem): Promise<Array<{
    role: 'user';
    content: string;
}>>;
/**
 * Converts a full thread history (array of ThreadItems) to Agent SDK input format.
 *
 * This enables the AI to see the complete conversation history including
 * widgets, workflows, and tasks that were previously displayed.
 *
 * This is the Python SDK parity version - accepts full thread history!
 *
 * @param items - Array of thread items from conversation history
 * @returns Agent SDK input format (array of input items)
 *
 * @example Full history with widgets
 * ```typescript
 * // Load recent thread history from database
 * const historyResult = await store.loadThreadItems(
 *   threadId,
 *   null,  // after
 *   50,    // limit
 *   'asc', // chronological order
 *   context
 * );
 *
 * // Convert ALL items to agent input (includes widgets, workflows, tasks!)
 * const agentInput = await simpleToAgentInput(historyResult.data);
 *
 * // Pass to agent - AI now knows about widgets that were displayed!
 * const result = await run(agent, agentInput, {
 *   stream: true,
 *   context: agentContext
 *   // Note: Don't use previousResponseId when using manual history
 * });
 * ```
 */
declare function simpleToAgentInput(items: ThreadItem[]): Promise<ResponseInputItem[]>;

/**
 * Converts an Agent SDK Runner stream to ChatKit ThreadStreamEvents.
 *
 * This function bridges the Agent SDK and ChatKit by:
 * 1. Listening to Agent Runner stream events
 * 2. Converting message outputs to ChatKit AssistantMessageItems
 * 3. Saving items to the store
 * 4. Emitting ChatKit-compatible events for the frontend
 *
 * @template TContext - The user-defined context type
 * @param context - The AgentContext containing thread, store, and request context
 * @param agentRunner - The Agent SDK Runner stream (from Runner.runStreamed())
 * @param options - Optional configuration
 * @param options.showThinking - Whether to emit reasoning/workflow events (default: true)
 * @returns AsyncGenerator of ChatKit ThreadStreamEvents
 *
 * @example
 * ```typescript
 * const agentContext: AgentContext<MyContext> = {
 *   thread: currentThread,
 *   store: myStore,
 *   requestContext: { userId: 'user123' }
 * };
 *
 * const runnerStream = Runner.runStreamed(myAgent, input, { context: agentContext });
 *
 * // Show thinking (default)
 * for await (const event of streamAgentResponse(agentContext, runnerStream)) {
 *   yield event;
 * }
 *
 * // Hide thinking
 * for await (const event of streamAgentResponse(agentContext, runnerStream, { showThinking: false })) {
 *   yield event;
 * }
 * ```
 */
declare function streamAgentResponse<TContext = unknown>(context: AgentContext<TContext>, agentRunner: AsyncIterable<RunStreamEvent>, options?: {
    showThinking?: boolean;
}): AsyncGenerator<ThreadStreamEvent>;

/**
 * Base class for converting Agent SDK RunItems to ChatKit ThreadItems.
 *
 * This abstract class allows you to customize how Agent outputs are converted
 * to ChatKit items. Extend this class to implement custom conversion logic
 * for your specific use case.
 *
 * @template TContext - The user-defined context type
 *
 * @example
 * ```typescript
 * class CustomItemConverter<TContext> extends ThreadItemConverter<TContext> {
 *   async convert(
 *     agentOutput: RunItem,
 *     thread: ThreadMetadata,
 *     store: Store<TContext>,
 *     context: TContext
 *   ): Promise<ThreadItem> {
 *     // Custom conversion logic here
 *     // For example, handle tool calls, add metadata, etc.
 *     return customThreadItem;
 *   }
 * }
 * ```
 */
declare abstract class ThreadItemConverter<TContext = unknown> {
    /**
     * Converts an Agent SDK RunItem to a ChatKit ThreadItem.
     *
     * @param agentOutput - The Agent SDK RunItem to convert
     * @param thread - The current thread metadata
     * @param store - The store instance for generating IDs or fetching additional data
     * @param context - The user-defined request context
     * @returns The converted ChatKit ThreadItem
     */
    abstract convert(agentOutput: RunItem, thread: ThreadMetadata, store: Store<TContext>, context: TContext): Promise<ThreadItem>;
}
/**
 * Default implementation of ThreadItemConverter that handles basic text message conversion.
 *
 * This converter extracts text output from Agent message items and creates
 * ChatKit AssistantMessageItems. For more advanced conversions (tool calls,
 * handoffs, etc.), extend the ThreadItemConverter class.
 *
 * @template TContext - The user-defined context type
 */
declare class DefaultThreadItemConverter<TContext = unknown> extends ThreadItemConverter<TContext> {
    convert(agentOutput: RunItem, thread: ThreadMetadata, store: Store<TContext>, context: TContext): Promise<ThreadItem>;
}

/**
 * Widget Streaming Helper Functions
 *
 * This module provides utilities for streaming and updating widgets,
 * including diff calculation and text accumulation from Agent SDK streams.
 */

/**
 * Compare two WidgetRoot structures and return a list of deltas.
 *
 * This function determines what has changed between two widget states and returns
 * the minimal set of updates needed to transform the `before` state into the `after` state.
 *
 * For Text and Markdown components with an `id`, it detects text value changes and
 * emits streaming text deltas if the new value is a prefix extension of the old value.
 *
 * @param before - The previous widget state
 * @param after - The new widget state
 * @returns Array of update events (text deltas, component updates, or full replacement)
 *
 * @example
 * ```typescript
 * const before: Card = { type: 'Card', children: [{ type: 'Text', id: 'msg', value: 'Hello' }] };
 * const after: Card = { type: 'Card', children: [{ type: 'Text', id: 'msg', value: 'Hello World' }] };
 * const deltas = diffWidget(before, after);
 * // Returns: [{ type: 'widget.streaming_text.value_delta', component_id: 'msg', delta: ' World', done: false }]
 * ```
 */
declare function diffWidget(before: WidgetRoot, after: WidgetRoot): Array<WidgetStreamingTextValueDelta | WidgetRootUpdated | WidgetComponentUpdated>;
/**
 * Accumulate text from Agent SDK stream events into a Text or Markdown widget.
 *
 * This helper function listens to Agent SDK `output_text_delta` events and progressively
 * updates the widget's value property, yielding new widget states as text accumulates.
 *
 * @template TWidget - Type of widget (Text or Markdown)
 * @param events - Async iterable of Agent SDK RunStreamEvents
 * @param baseWidget - Initial widget to accumulate text into (must have id and streaming: true)
 * @returns Async generator yielding updated widget states
 *
 * @example
 * ```typescript
 * const agentRun = Runner.runStreamed(agent, input);
 *
 * for await (const textWidget of accumulateText(
 *   agentRun.streamEvents(),
 *   { type: 'Text', id: 'output', value: '', streaming: true }
 * )) {
 *   const card: Card = { type: 'Card', children: [textWidget] };
 *   yield card; // Emit updated widget with accumulated text
 * }
 * ```
 */
declare function accumulateText<TWidget extends Text | Markdown>(events: AsyncIterable<RunStreamEvent>, baseWidget: TWidget): AsyncGenerator<TWidget>;

/**
 * Async Generator Stream Merging Utility
 *
 * This module provides a utility to merge two async generators into a single stream,
 * yielding events as they arrive from either source. This enables combining Agent SDK
 * events with custom integration events (like widgets, workflows, etc.).
 */
/**
 * Wrapper to distinguish events from the secondary stream (custom events)
 */
declare class EventWrapper<T> {
    readonly event: T;
    constructor(event: T);
}
/**
 * Merges two async iterators, yielding events as they arrive from either source.
 *
 * Events from the first iterator (typically Agent SDK) are yielded directly.
 * Events from the second iterator (typically custom events) are wrapped in EventWrapper.
 *
 * This implements a similar pattern to Python's `_merge_generators` using Promise.race
 * to handle whichever iterator produces a value first.
 *
 * @template T1 - Type of events from first iterator (Agent SDK events)
 * @template T2 - Type of events from second iterator (custom events)
 * @param a - First async iterator (e.g., Agent SDK stream)
 * @param b - Second async iterator (e.g., custom event queue)
 * @returns Merged async generator yielding T1 | EventWrapper<T2>
 *
 * @example
 * ```typescript
 * const agentStream = agentRunner.streamEvents();
 * const customEventQueue = createEventQueue();
 *
 * for await (const event of mergeAsyncGenerators(agentStream, customEventQueue)) {
 *   if (event instanceof EventWrapper) {
 *     // This is a custom event
 *     yield event.event;
 *   } else {
 *     // This is an Agent SDK event
 *     processAgentEvent(event);
 *   }
 * }
 * ```
 */
declare function mergeAsyncGenerators<T1, T2>(a: AsyncIterator<T1>, b: AsyncIterator<T2>, onFirstComplete?: () => void): AsyncGenerator<T1 | EventWrapper<T2>>;

/**
 * ChatKit Agents SDK Integration
 *
 * This module provides integration helpers for using the OpenAI Agents SDK
 * with ChatKit. It bridges the gap between Agent Runner streams and ChatKit
 * ThreadStreamEvents, making it easy to build agent-powered chat applications.
 *
 * Includes support for:
 * - Agent response streaming
 * - Widget streaming from tools
 * - Event merging (multi-agent workflows)
 * - Thread item conversion
 *
 * @module agents
 */

type index_AgentContext<TContext = unknown> = AgentContext<TContext>;
type index_AsyncEventQueue<T> = AsyncEventQueue<T>;
declare const index_AsyncEventQueue: typeof AsyncEventQueue;
type index_DefaultThreadItemConverter<TContext = unknown> = DefaultThreadItemConverter<TContext>;
declare const index_DefaultThreadItemConverter: typeof DefaultThreadItemConverter;
type index_EventWrapper<T> = EventWrapper<T>;
declare const index_EventWrapper: typeof EventWrapper;
type index_InputThreadItemConverter = InputThreadItemConverter;
declare const index_InputThreadItemConverter: typeof InputThreadItemConverter;
type index_ResponseFunctionCallOutput = ResponseFunctionCallOutput;
type index_ResponseFunctionToolCall = ResponseFunctionToolCall;
type index_ResponseInputContentParam = ResponseInputContentParam;
type index_ResponseInputImageParam = ResponseInputImageParam;
type index_ResponseInputItem = ResponseInputItem;
type index_ResponseInputMessage = ResponseInputMessage;
type index_ResponseInputTextParam = ResponseInputTextParam;
type index_ThreadItemConverter<TContext = unknown> = ThreadItemConverter<TContext>;
declare const index_ThreadItemConverter: typeof ThreadItemConverter;
declare const index_accumulateText: typeof accumulateText;
declare const index_createAgentContext: typeof createAgentContext;
declare const index_defaultInputConverter: typeof defaultInputConverter;
declare const index_diffWidget: typeof diffWidget;
declare const index_mergeAsyncGenerators: typeof mergeAsyncGenerators;
declare const index_simpleToAgentInput: typeof simpleToAgentInput;
declare const index_streamAgentResponse: typeof streamAgentResponse;
declare namespace index {
  export { type index_AgentContext as AgentContext, index_AsyncEventQueue as AsyncEventQueue, index_DefaultThreadItemConverter as DefaultThreadItemConverter, index_EventWrapper as EventWrapper, index_InputThreadItemConverter as InputThreadItemConverter, type index_ResponseFunctionCallOutput as ResponseFunctionCallOutput, type index_ResponseFunctionToolCall as ResponseFunctionToolCall, type index_ResponseInputContentParam as ResponseInputContentParam, type index_ResponseInputImageParam as ResponseInputImageParam, type index_ResponseInputItem as ResponseInputItem, type index_ResponseInputMessage as ResponseInputMessage, type index_ResponseInputTextParam as ResponseInputTextParam, index_ThreadItemConverter as ThreadItemConverter, index_accumulateText as accumulateText, index_createAgentContext as createAgentContext, index_defaultInputConverter as defaultInputConverter, index_diffWidget as diffWidget, index_mergeAsyncGenerators as mergeAsyncGenerators, index_simpleToAgentInput as simpleToAgentInput, index_streamAgentResponse as streamAgentResponse };
}

export { type ActionConfig, type ActiveStatus, type Annotation, type AssistantMessageContent, type AssistantMessageContentPartAdded, type AssistantMessageContentPartAnnotationAdded, type AssistantMessageContentPartDone, type AssistantMessageContentPartTextDelta, type AssistantMessageItem, type Attachment, type AttachmentCreateParams, type AttachmentDeleteParams, AttachmentStore, type AttachmentsCreateReq, type AttachmentsDeleteReq, type ChatKitReq, ChatKitServer, type ClientToolCallItem, type ClosedStatus, CustomStreamError, type CustomSummary, type CustomTask, type DurationSummary, type EndOfTurnItem, type EntitySource, ErrorCode, type ErrorEvent, type FeedbackKind, type FileAttachment, type FileSource, type FileTask, type Handler, type HiddenContextItem, type IconName, type ImageAttachment, type ImageTask, type InferenceOptions, type ItemFeedbackParams, type ItemsFeedbackReq, type ItemsListParams, type ItemsListReq, type LoadingBehavior, type LockedStatus, type Logger, type NonStreamingReq, NonStreamingResult, NotFoundError$1 as NotFoundError, type NoticeEvent, type Page, type ProgressUpdateEvent, type SearchTask, type Source, Store, type StoreItemType, NotFoundError as StoreNotFoundError, StreamError, type StreamingReq, StreamingResult, type Task, type TaskItem, type ThoughtTask, type Thread, type ThreadAddClientToolOutputParams, type ThreadAddUserMessageParams, type ThreadCreateParams, type ThreadCreatedEvent, type ThreadCustomActionParams, type ThreadDeleteParams, type ThreadGetByIdParams, type ThreadItem, type ThreadItemAddedEvent, type ThreadItemDoneEvent, type ThreadItemRemovedEvent, type ThreadItemReplacedEvent, type ThreadItemUpdate, type ThreadItemUpdated, type ThreadListParams, type ThreadMetadata, type ThreadRetryAfterItemParams, type ThreadStatus, type ThreadStreamEvent, type ThreadUpdateParams, type ThreadUpdatedEvent, type ThreadsAddClientToolOutputReq, type ThreadsAddUserMessageReq, type ThreadsCreateReq, type ThreadsCustomActionReq, type ThreadsDeleteReq, type ThreadsGetByIdReq, type ThreadsListReq, type ThreadsRetryAfterItemReq, type ThreadsUpdateReq, type ToolChoice, type URLSource, type UserMessageContent, type UserMessageInput, type UserMessageItem, type UserMessageTagContent, type UserMessageTextContent, type WidgetComponent, type WidgetComponentUpdated, type WidgetIcon, type WidgetItem, type WidgetRoot, type WidgetRootUpdated, type WidgetStreamingTextValueDelta, type Workflow, type WorkflowItem, type WorkflowSummary, type WorkflowTaskAdded, type WorkflowTaskUpdated, index as agents, defaultGenerateAttachmentId, defaultGenerateItemId, defaultGenerateThreadId, defaultLogger, generateId, isActiveStatus, isAssistantMessage, isClientToolCall, isClosedStatus, isCustomTask, isEndOfTurn, isEntitySource, isErrorEvent, isFileAttachment, isFileSource, isFileTask, isHiddenContext, isImageAttachment, isImageTask, isLockedStatus, isNonStreamingReq, isNoticeEvent, isProgressUpdateEvent, isSearchTask, isStreamingReq, isTaskItem, isThoughtTask, isThreadCreatedEvent, isThreadItemAddedEvent, isThreadItemDoneEvent, isThreadItemRemovedEvent, isThreadItemReplacedEvent, isThreadUpdatedEvent, isURLSource, isUserMessage, isWidgetItem, isWorkflowItem };
